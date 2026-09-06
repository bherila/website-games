<?php

namespace Tests\Unit\Mandarin;

use App\Services\Games\Mandarin\Sfx\SfxRenderer;
use PHPUnit\Framework\TestCase;

class SfxRendererTest extends TestCase
{
    public function test_renders_every_course_recipe_as_valid_bounded_wav(): void
    {
        $renderer = new SfxRenderer;
        $limits = ['soft-wood-tap-v1' => 100, 'two-note-soft-chime-v1' => 350, 'soft-neutral-pluck-v1' => 200, 'three-note-resolve-v1' => 800];
        foreach ($limits as $id => $maxDurationMs) {
            $result = $renderer->render($id);
            $bytes = $result['bytes'];
            $this->assertSame('RIFF', substr($bytes, 0, 4), $id);
            $this->assertSame('WAVE', substr($bytes, 8, 4), $id);
            $this->assertSame('fmt ', substr($bytes, 12, 4), $id);
            $this->assertSame(strlen($bytes) - 8, unpack('V', substr($bytes, 4, 4))[1], $id);
            $this->assertLessThanOrEqual($maxDurationMs + 40, $result['durationMs'], $id);
            $this->assertGreaterThan(0, $result['durationMs'], $id);
            $this->assertSame('audio/wav', $result['contentType']);

            // Non-silent and bounded amplitude.
            $pcm = substr($bytes, 44);
            $peak = 0;
            $sum = 0;
            $count = intdiv(strlen($pcm), 2);
            for ($i = 0; $i < $count; $i += 16) {
                $sample = unpack('s', substr($pcm, $i * 2, 2))[1];
                $peak = max($peak, abs($sample));
                $sum += abs($sample);
            }
            $this->assertGreaterThan(200, $peak, "{$id} is silent");
            $this->assertLessThan(32767 * 0.6, $peak, "{$id} is too loud");
            $this->assertGreaterThan(0, $sum);
        }
    }

    public function test_is_deterministic(): void
    {
        $renderer = new SfxRenderer;
        $this->assertSame(hash('sha256', $renderer->render('soft-wood-tap-v1')['bytes']), hash('sha256', $renderer->render('soft-wood-tap-v1')['bytes']));
    }
}
