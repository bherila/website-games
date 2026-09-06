<?php

namespace App\Services\Games\Mandarin\Audio;

use App\Services\Games\Mandarin\Speech\ProcessRunner;
use Illuminate\Support\Str;

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
            $probe = $this->probeDuration($bytes, $contentType);
            if ($probe['status'] === 'ok') {
                $method = 'ffprobe';
                $durationMs = $probe['durationMs'];
                if ($durationMs < $minDurationMs || $durationMs > $maxDurationMs) {
                    $problems[] = "duration {$durationMs}ms outside [{$minDurationMs}, {$maxDurationMs}]";
                }
            } elseif ($probe['status'] === 'failed') {
                // ffprobe ran and could not decode it: plausible magic bytes are not playable audio.
                $method = 'ffprobe';
                $problems[] = 'ffprobe could not decode the audio: '.$probe['detail'];
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

    /**
     * `unavailable` means the tool could not run (not installed); `failed` means it ran
     * and rejected the bytes. Only the former falls back to container checks.
     *
     * @return array{status: 'ok'|'failed'|'unavailable', durationMs: int, detail: string}
     */
    private function probeDuration(string $bytes, string $contentType): array
    {
        if ($this->ffprobe === null || $this->ffprobe === '') {
            return ['status' => 'unavailable', 'durationMs' => 0, 'detail' => 'ffprobe not configured'];
        }
        $file = tempnam(sys_get_temp_dir(), 'mandarin-probe-');
        if ($file === false) {
            return ['status' => 'unavailable', 'durationMs' => 0, 'detail' => 'no temp file'];
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
            $stderr = trim($result->stderr);
            if ($result->exitCode === 127 || $result->exitCode === 124 || str_contains($stderr, 'No such file or directory') && str_contains($stderr, $this->ffprobe) || str_contains($stderr, 'not found')) {
                return ['status' => 'unavailable', 'durationMs' => 0, 'detail' => $stderr === '' ? 'ffprobe unavailable' : $stderr];
            }
            if (! $result->ok()) {
                return ['status' => 'failed', 'durationMs' => 0, 'detail' => $stderr === '' ? 'exit '.$result->exitCode : Str::limit($stderr, 200)];
            }
            $seconds = (float) trim($result->stdout);
            if ($seconds <= 0) {
                return ['status' => 'failed', 'durationMs' => 0, 'detail' => 'no decodable duration'];
            }

            return ['status' => 'ok', 'durationMs' => (int) round($seconds * 1000), 'detail' => ''];
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
