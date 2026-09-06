<?php

namespace Tests\Unit\Mandarin;

use App\Services\Games\Mandarin\Audio\AudioValidator;
use App\Services\Games\Mandarin\Speech\ProcessResult;
use PHPUnit\Framework\TestCase;

class AudioValidatorTest extends TestCase
{
    private const MP3ISH = "ID3\0\0\0\0\0\0\0xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

    public function test_rejects_bytes_ffprobe_cannot_decode_even_with_plausible_magic(): void
    {
        $runner = new FakeProcessRunner(fn (array $argv): ProcessResult => new ProcessResult(1, '', 'Invalid data found when processing input'));
        $result = (new AudioValidator($runner, 'ffprobe'))->validate(self::MP3ISH, 'audio/mpeg', 150, 20000, 2_000_000);
        $this->assertFalse($result['ok']);
        $this->assertSame('ffprobe', $result['method']);
        $this->assertStringContainsString('could not decode', $result['problems'][0]);
    }

    public function test_falls_back_to_container_checks_only_when_ffprobe_is_unavailable(): void
    {
        $runner = new FakeProcessRunner(fn (array $argv): ProcessResult => new ProcessResult(127, '', 'ffprobe: command not found'));
        $result = (new AudioValidator($runner, 'ffprobe'))->validate(self::MP3ISH, 'audio/mpeg', 150, 20000, 2_000_000);
        $this->assertTrue($result['ok']);
        $this->assertSame('basic', $result['method']);
        $none = (new AudioValidator($runner, null))->validate(self::MP3ISH, 'audio/mpeg', 150, 20000, 2_000_000);
        $this->assertSame('basic', $none['method']);
    }

    public function test_accepts_a_decodable_clip_within_duration_bounds_and_rejects_out_of_range(): void
    {
        $runner = new FakeProcessRunner(fn (array $argv): ProcessResult => new ProcessResult(0, "0.744\n", ''));
        $validator = new AudioValidator($runner, 'ffprobe');
        $ok = $validator->validate(self::MP3ISH, 'audio/mpeg', 150, 20000, 2_000_000);
        $this->assertTrue($ok['ok']);
        $this->assertSame(744, $ok['durationMs']);
        $short = $validator->validate(self::MP3ISH, 'audio/mpeg', 1000, 20000, 2_000_000);
        $this->assertFalse($short['ok']);
        $this->assertFalse($validator->validate('{"error":true}', 'audio/mpeg', 150, 20000, 2_000_000)['ok']);
        $this->assertFalse($validator->validate('', 'audio/mpeg', 150, 20000, 2_000_000)['ok']);
    }
}
