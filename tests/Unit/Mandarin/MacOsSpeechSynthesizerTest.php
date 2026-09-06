<?php

namespace Tests\Unit\Mandarin;

use App\Services\Games\Mandarin\Speech\MacOsSpeechSynthesizer;
use App\Services\Games\Mandarin\Speech\ProcessResult;
use App\Services\Games\Mandarin\Speech\SpeechProviderException;
use App\Services\Games\Mandarin\Speech\SpeechRequest;
use PHPUnit\Framework\TestCase;

class MacOsSpeechSynthesizerTest extends TestCase
{
    private const VOICE_LIST = "Alex                en_US    # Hello\nEddy (Chinese (China mainland)) zh_CN    # 你好！我叫Eddy。\nEddy (Chinese (Taiwan)) zh_TW    # 你好，我叫Eddy。\nTingting            zh_CN    # 你好！我叫婷婷。\nMeijia              zh_TW    # 你好，我叫美佳。\nFlo (Chinese (China mainland)) zh_CN    # 你好！我叫Flo。\n";

    public function test_discovers_only_mainland_voices_preferring_tingting_and_assigns_roles_stably(): void
    {
        $runner = new FakeProcessRunner(fn (array $argv): ProcessResult => new ProcessResult(0, self::VOICE_LIST, ''));
        $provider = new MacOsSpeechSynthesizer($runner);
        $this->assertSame(['Tingting', 'Eddy (Chinese (China mainland))', 'Flo (Chinese (China mainland))'], $provider->installedVoices());
        $this->assertSame('Tingting', $provider->voiceFor('narrator'));
        $this->assertSame('Tingting', $provider->voiceFor('guide'));
        $this->assertSame('Eddy (Chinese (China mainland))', $provider->voiceFor('traveler'));
        $this->assertSame('Flo (Chinese (China mainland))', $provider->voiceFor('friend'));
        $this->assertTrue($provider->hasDistinctMandarinVoices());
        $this->assertSame('macos', $provider->recipe(new SpeechRequest('你好', 'normal', 'guide'))['provider']);
        $this->assertSame(125, $provider->recipe(new SpeechRequest('你好', 'slow', 'guide'))['rate']);
    }

    public function test_refuses_to_read_mandarin_without_a_zh_cn_voice(): void
    {
        $runner = new FakeProcessRunner(fn (array $argv): ProcessResult => new ProcessResult(0, "Alex                en_US    # Hello\nMeijia              zh_TW    # 你好\n", ''));
        $provider = new MacOsSpeechSynthesizer($runner);
        $this->expectException(SpeechProviderException::class);
        $this->expectExceptionMessage('No zh_CN system voice');
        $provider->synthesize(new SpeechRequest('你好', 'normal', 'guide'));
    }

    public function test_synthesizes_through_say_and_afconvert_with_argument_arrays(): void
    {
        $runner = new FakeProcessRunner(function (array $argv): ProcessResult {
            if ($argv[1] === '-v' && $argv[2] === '?') {
                return new ProcessResult(0, self::VOICE_LIST, '');
            }
            if (str_ends_with($argv[0], 'say')) {
                file_put_contents($argv[array_search('-o', $argv, true) + 1], 'AIFF');

                return new ProcessResult(0, '', '');
            }
            file_put_contents($argv[count($argv) - 1], 'M4A-BYTES');

            return new ProcessResult(0, '', '');
        });
        $provider = new MacOsSpeechSynthesizer($runner, '/usr/bin/say', '/usr/bin/afconvert', 150, 125, [], sys_get_temp_dir());
        $audio = $provider->synthesize(new SpeechRequest("你好。你是谁？'; rm -rf /", 'slow', 'traveler'));
        $this->assertSame('M4A-BYTES', $audio->bytes);
        $this->assertSame('audio/mp4', $audio->contentType);
        $say = $runner->calls[1];
        $this->assertSame('/usr/bin/say', $say[0]);
        $this->assertSame('Eddy (Chinese (China mainland))', $say[2]);
        $this->assertSame('125', $say[4]);
        $this->assertSame("你好。你是谁？'; rm -rf /", end($say), 'text is a single argv element, never shell-interpolated');
    }
}
