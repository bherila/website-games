<?php

namespace App\Services\Games\Mandarin\Sfx;

use InvalidArgumentException;

/**
 * Deterministic procedural renderer for the four UI cues. Same recipes as the
 * browser preview (resources/js/games/mandarin/audio/sfxRecipes.ts) so the
 * served files and the Web Audio fallback sound alike. Produces real PCM WAV
 * bytes with a valid header; no model, no credentials, no network.
 */
class SfxRenderer
{
    public const RECIPE_VERSION = 'sfx-wav-v1';

    public const SAMPLE_RATE = 44100;

    /** @var array<string, array{steps: list<array<string, mixed>>}> */
    public const RECIPES = [
        'soft-wood-tap-v1' => ['steps' => [
            ['kind' => 'noise', 'filter' => 'bandpass', 'frequencyHz' => 1800, 'q' => 2.5, 'startMs' => 0, 'durationMs' => 40, 'gain' => 0.18, 'attackMs' => 1, 'seed' => 7],
            ['kind' => 'tone', 'wave' => 'sine', 'frequencyHz' => 180, 'endFrequencyHz' => 110, 'startMs' => 0, 'durationMs' => 70, 'gain' => 0.16, 'attackMs' => 2],
        ]],
        'two-note-soft-chime-v1' => ['steps' => [
            ['kind' => 'tone', 'wave' => 'sine', 'frequencyHz' => 659.26, 'startMs' => 0, 'durationMs' => 160, 'gain' => 0.14, 'attackMs' => 6],
            ['kind' => 'tone', 'wave' => 'sine', 'frequencyHz' => 783.99, 'startMs' => 130, 'durationMs' => 200, 'gain' => 0.14, 'attackMs' => 6],
        ]],
        'soft-neutral-pluck-v1' => ['steps' => [
            ['kind' => 'tone', 'wave' => 'triangle', 'frequencyHz' => 440, 'startMs' => 0, 'durationMs' => 180, 'gain' => 0.12, 'attackMs' => 3],
        ]],
        'three-note-resolve-v1' => ['steps' => [
            ['kind' => 'tone', 'wave' => 'sine', 'frequencyHz' => 523.25, 'startMs' => 0, 'durationMs' => 240, 'gain' => 0.13, 'attackMs' => 8],
            ['kind' => 'tone', 'wave' => 'sine', 'frequencyHz' => 659.26, 'startMs' => 180, 'durationMs' => 240, 'gain' => 0.13, 'attackMs' => 8],
            ['kind' => 'tone', 'wave' => 'sine', 'frequencyHz' => 783.99, 'startMs' => 360, 'durationMs' => 380, 'gain' => 0.13, 'attackMs' => 8],
        ]],
    ];

    public static function has(string $recipeId): bool
    {
        return isset(self::RECIPES[$recipeId]);
    }

    /** @return array{bytes: string, durationMs: int, contentType: string, extension: string} */
    public function render(string $recipeId): array
    {
        $recipe = self::RECIPES[$recipeId] ?? throw new InvalidArgumentException("Unknown SFX recipe {$recipeId}");
        $rate = self::SAMPLE_RATE;
        $endMs = 0;
        foreach ($recipe['steps'] as $step) {
            $endMs = max($endMs, (int) $step['startMs'] + (int) $step['durationMs']);
        }
        $tailMs = 30;
        $frames = (int) ceil(($endMs + $tailMs) / 1000 * $rate);
        $mix = array_fill(0, $frames, 0.0);

        foreach ($recipe['steps'] as $step) {
            $start = (int) floor((int) $step['startMs'] / 1000 * $rate);
            $length = (int) ceil((int) $step['durationMs'] / 1000 * $rate);
            $attack = max(1, (int) ceil((float) $step['attackMs'] / 1000 * $rate));
            $gain = (float) $step['gain'];
            $samples = $step['kind'] === 'tone' ? $this->tone($step, $length, $rate) : $this->noise($step, $length, $rate);
            for ($i = 0; $i < $length; $i++) {
                // Linear attack, then exponential decay to ~0 at the end (matches the Web Audio ramps).
                $envelope = $i < $attack
                    ? $i / $attack
                    : exp(log(0.0001 / 1.0) * (($i - $attack) / max(1, $length - $attack)));
                $index = $start + $i;
                if ($index < $frames) {
                    $mix[$index] += $samples[$i] * $gain * $envelope;
                }
            }
        }

        $pcm = '';
        foreach ($mix as $sample) {
            $clamped = max(-1.0, min(1.0, $sample));
            $pcm .= pack('v', (int) round($clamped * 32767) & 0xFFFF);
        }

        return [
            'bytes' => $this->wav($pcm, $rate),
            'durationMs' => (int) round($frames / $rate * 1000),
            'contentType' => 'audio/wav',
            'extension' => 'wav',
        ];
    }

    /**
     * @param  array<string, mixed>  $step
     * @return list<float>
     */
    private function tone(array $step, int $length, int $rate): array
    {
        $out = [];
        $f0 = (float) $step['frequencyHz'];
        $f1 = isset($step['endFrequencyHz']) ? max(1.0, (float) $step['endFrequencyHz']) : $f0;
        $phase = 0.0;
        for ($i = 0; $i < $length; $i++) {
            $t = $length > 1 ? $i / ($length - 1) : 0.0;
            $frequency = $f0 * pow($f1 / $f0, $t); // exponential sweep, like exponentialRampToValueAtTime
            $phase += 2 * M_PI * $frequency / $rate;
            $out[] = $step['wave'] === 'triangle'
                ? (2 / M_PI) * asin(sin($phase))
                : sin($phase);
        }

        return $out;
    }

    /**
     * Seeded xorshift noise through a biquad filter (Audio EQ Cookbook coefficients).
     *
     * @param  array<string, mixed>  $step
     * @return list<float>
     */
    private function noise(array $step, int $length, int $rate): array
    {
        $state = ((int) $step['seed'] * 2654435761) & 0xFFFFFFFF;
        if ($state === 0) {
            $state = 1;
        }
        $raw = [];
        for ($i = 0; $i < $length; $i++) {
            $state ^= ($state << 13) & 0xFFFFFFFF;
            $state ^= $state >> 17;
            $state ^= ($state << 5) & 0xFFFFFFFF;
            $raw[] = ($state / 0xFFFFFFFF) * 2 - 1;
        }
        $w0 = 2 * M_PI * (float) $step['frequencyHz'] / $rate;
        $q = (float) $step['q'];
        $alpha = sin($w0) / (2 * $q);
        $cos = cos($w0);
        if ($step['filter'] === 'bandpass') {
            $b0 = $alpha;
            $b1 = 0.0;
            $b2 = -$alpha;
        } else {
            $b0 = (1 - $cos) / 2;
            $b1 = 1 - $cos;
            $b2 = (1 - $cos) / 2;
        }
        $a0 = 1 + $alpha;
        $a1 = -2 * $cos;
        $a2 = 1 - $alpha;
        $out = [];
        $x1 = $x2 = $y1 = $y2 = 0.0;
        foreach ($raw as $x0) {
            $y0 = ($b0 / $a0) * $x0 + ($b1 / $a0) * $x1 + ($b2 / $a0) * $x2 - ($a1 / $a0) * $y1 - ($a2 / $a0) * $y2;
            $x2 = $x1;
            $x1 = $x0;
            $y2 = $y1;
            $y1 = $y0;
            $out[] = $y0;
        }

        return $out;
    }

    private function wav(string $pcm, int $rate): string
    {
        $channels = 1;
        $bits = 16;
        $byteRate = $rate * $channels * $bits / 8;
        $blockAlign = $channels * $bits / 8;
        $dataLength = strlen($pcm);

        return 'RIFF'.pack('V', 36 + $dataLength).'WAVE'
            .'fmt '.pack('VvvVVvv', 16, 1, $channels, $rate, (int) $byteRate, (int) $blockAlign, $bits)
            .'data'.pack('V', $dataLength).$pcm;
    }
}
