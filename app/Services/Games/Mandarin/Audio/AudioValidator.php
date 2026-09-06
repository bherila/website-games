<?php

namespace App\Services\Games\Mandarin\Audio;

use App\Services\Games\Mandarin\Speech\ProcessRunner;

/**
 * Validates provider output before it can be published as ready: non-empty,
 * plausible container magic, bounded size, and — when ffprobe is installed —
 * decodable with a plausible duration. A text/JSON error body must never be
 * stored as audio.
 */
class AudioValidator
{
    public function __construct(private readonly ProcessRunner $runner, private readonly ?string $ffprobe = 'ffprobe') {}

    /**
     * @return array{ok: bool, problems: list<string>, durationMs: int|null, method: string}
     */
    public function validate(string $bytes, string $contentType, int $minDurationMs, int $maxDurationMs, int $maxBytes): array
    {
        $problems = [];
        if ($bytes === '') {
            return ['ok' => false, 'problems' => ['empty audio'], 'durationMs' => null, 'method' => 'basic'];
        }
        if (strlen($bytes) > $maxBytes) {
            $problems[] = 'audio exceeds '.$maxBytes.' bytes';
        }
        if (! $this->magicMatches($bytes, $contentType)) {
            $problems[] = "bytes do not look like {$contentType} (possible error body)";
        }
        $durationMs = null;
        $method = 'basic';
        if ($problems === []) {
            $durationMs = $this->probeDuration($bytes, $contentType);
            if ($durationMs !== null) {
                $method = 'ffprobe';
                if ($durationMs < $minDurationMs || $durationMs > $maxDurationMs) {
                    $problems[] = "duration {$durationMs}ms outside [{$minDurationMs}, {$maxDurationMs}]";
                }
            } elseif ($contentType === 'audio/wav') {
                $method = 'wav-header';
                $durationMs = $this->wavDuration($bytes);
            }
        }

        return ['ok' => $problems === [], 'problems' => $problems, 'durationMs' => $durationMs, 'method' => $method];
    }

    private function magicMatches(string $bytes, string $contentType): bool
    {
        $head = substr($bytes, 0, 12);

        return match ($contentType) {
            'audio/mpeg' => str_starts_with($head, 'ID3') || (ord($head[0]) === 0xFF && (ord($head[1]) & 0xE0) === 0xE0),
            'audio/mp4' => substr($head, 4, 4) === 'ftyp',
            'audio/wav' => str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WAVE',
            default => false,
        };
    }

    private function probeDuration(string $bytes, string $contentType): ?int
    {
        if ($this->ffprobe === null || $this->ffprobe === '') {
            return null;
        }
        $file = tempnam(sys_get_temp_dir(), 'mandarin-probe-');
        if ($file === false) {
            return null;
        }
        $path = $file.match ($contentType) {
            'audio/mpeg' => '.mp3',
            'audio/mp4' => '.m4a',
            default => '.wav',
        };
        rename($file, $path);
        try {
            file_put_contents($path, $bytes);
            $result = $this->runner->run([$this->ffprobe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', $path], 30);
            if (! $result->ok()) {
                return null;
            }
            $seconds = (float) trim($result->stdout);

            return $seconds > 0 ? (int) round($seconds * 1000) : null;
        } finally {
            @unlink($path);
        }
    }

    private function wavDuration(string $bytes): ?int
    {
        if (strlen($bytes) < 44) {
            return null;
        }
        $header = unpack('vformat/vchannels/Vrate/VbyteRate', substr($bytes, 20, 12));
        if ($header === false || (int) $header['byteRate'] === 0) {
            return null;
        }

        return (int) round((strlen($bytes) - 44) / (int) $header['byteRate'] * 1000);
    }
}
