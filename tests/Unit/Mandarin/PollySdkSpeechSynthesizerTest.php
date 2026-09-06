<?php

namespace Tests\Unit\Mandarin;

use App\Services\Games\Mandarin\Audio\AudioRecipe;
use App\Services\Games\Mandarin\Speech\PollyCliSpeechSynthesizer;
use App\Services\Games\Mandarin\Speech\PollySdkSpeechSynthesizer;
use App\Services\Games\Mandarin\Speech\ProcessResult;
use App\Services\Games\Mandarin\Speech\SpeechProviderException;
use App\Services\Games\Mandarin\Speech\SpeechRequest;
use Aws\Command;
use Aws\Exception\AwsException;
use Aws\Exception\CredentialsException;
use Aws\MockHandler;
use Aws\Polly\PollyClient;
use Aws\Result;
use GuzzleHttp\Psr7\Response;
use GuzzleHttp\Psr7\Utils;
use PHPUnit\Framework\TestCase;

/**
 * Everything here runs against a mocked handler with anonymous credentials:
 * no AWS call is ever made and no credential is ever read.
 */
class PollySdkSpeechSynthesizerTest extends TestCase
{
    private function client(MockHandler $handler): PollyClient
    {
        return new PollyClient([
            'version' => '2016-06-10',
            'region' => 'us-east-1',
            'credentials' => false,
            // No retry middleware: every append must map to exactly one call.
            'retries' => 0,
            'handler' => $handler,
        ]);
    }

    private function synthesizer(MockHandler $handler): PollySdkSpeechSynthesizer
    {
        return new PollySdkSpeechSynthesizer(null, 'us-east-1', 'neural', 'Zhiyu', 'cmn-CN', 'mp3', 24000, '85%', $this->client($handler));
    }

    public function test_the_sdk_and_cli_adapters_hash_to_the_same_cache_identity(): void
    {
        $cli = new PollyCliSpeechSynthesizer(new FakeProcessRunner(fn (array $argv): ProcessResult => new ProcessResult(0, '', '')));
        $sdk = new PollySdkSpeechSynthesizer;

        $this->assertSame($cli->id(), $sdk->id());
        foreach (['normal', 'slow'] as $variant) {
            $request = new SpeechRequest('你好。', $variant, 'guide');
            $this->assertSame($cli->recipe($request), $sdk->recipe($request), "the {$variant} recipe must not depend on the transport");
            $this->assertSame(
                AudioRecipe::speech($cli->recipe($request), '你好。')->hash,
                AudioRecipe::speech($sdk->recipe($request), '你好。')->hash,
                'switching transport must never orphan an already-paid-for clip',
            );
        }
        $this->assertSame('polly', $sdk->recipe(new SpeechRequest('你好。', 'normal', 'guide'))['provider']);
        $this->assertSame('85%', $sdk->recipe(new SpeechRequest('你好。', 'slow', 'guide'))['rate']);
        $this->assertFalse($sdk->hasDistinctMandarinVoices());
    }

    public function test_synthesize_sends_explicit_settings_and_returns_the_audio_stream(): void
    {
        $handler = new MockHandler;
        $handler->append(new Result(['AudioStream' => Utils::streamFor('ID3'.str_repeat("\0", 7).'POLLY'), 'ContentType' => 'audio/mpeg', 'RequestCharacters' => 3]));
        $audio = $this->synthesizer($handler)->synthesize(new SpeechRequest('你好。', 'normal', 'guide'));

        $this->assertSame('ID3'.str_repeat("\0", 7).'POLLY', $audio->bytes);
        $this->assertSame('audio/mpeg', $audio->contentType);
        $this->assertSame('mp3', $audio->extension);
        $this->assertSame(3, $audio->charactersBilled);
        $this->assertSame('Zhiyu', $audio->providerMetadata['voice']);
        $this->assertSame('sdk', $audio->providerMetadata['transport']);

        $sent = $handler->getLastCommand();
        $this->assertSame('SynthesizeSpeech', $sent->getName());
        $this->assertSame('neural', $sent['Engine']);
        $this->assertSame('Zhiyu', $sent['VoiceId']);
        $this->assertSame('cmn-CN', $sent['LanguageCode']);
        $this->assertSame('mp3', $sent['OutputFormat']);
        $this->assertSame('24000', $sent['SampleRate']);
        $this->assertSame('text', $sent['TextType']);
        $this->assertSame('你好。', $sent['Text']);
    }

    public function test_the_slow_variant_is_an_ssml_prosody_wrapper_around_escaped_text(): void
    {
        $handler = new MockHandler;
        $handler->append(new Result(['AudioStream' => Utils::streamFor('ID3'.str_repeat("\0", 7).'SLOW')]));
        $audio = $this->synthesizer($handler)->synthesize(new SpeechRequest('你好 & <b>再见</b>', 'slow', 'friend'));

        $sent = $handler->getLastCommand();
        $this->assertSame('ssml', $sent['TextType']);
        $this->assertSame('<speak><prosody rate="85%">你好 &amp; &lt;b&gt;再见&lt;/b&gt;</prosody></speak>', $sent['Text']);
        // No RequestCharacters in the response: fall back to the text length.
        $this->assertSame(14, $audio->charactersBilled);
    }

    public function test_throttling_and_server_errors_are_retryable_provider_unavailable(): void
    {
        foreach ([['ThrottlingException', 400], ['InternalServiceErrorException', 500]] as [$code, $status]) {
            $handler = new MockHandler;
            $handler->append(new AwsException('Rate exceeded for account 123456789012', new Command('SynthesizeSpeech'), [
                'code' => $code,
                'response' => new Response($status),
            ]));
            try {
                $this->synthesizer($handler)->synthesize(new SpeechRequest('你好。', 'normal', 'guide'));
                $this->fail("{$code} should raise a provider exception");
            } catch (SpeechProviderException $exception) {
                $this->assertSame('provider_unavailable', $exception->errorCode);
                $this->assertTrue($exception->retryable);
                $this->assertStringContainsString($code, $exception->getMessage());
                $this->assertStringNotContainsString('123456789012', $exception->getMessage(), 'provider messages must never carry account detail');
            }
        }
    }

    public function test_missing_credentials_are_an_unconfigured_provider_and_are_not_retried(): void
    {
        $handler = new MockHandler;
        $handler->append(new CredentialsException('Cannot read credentials from /home/deploy/.aws/credentials'));

        try {
            $this->synthesizer($handler)->synthesize(new SpeechRequest('你好。', 'normal', 'guide'));
            $this->fail('a credentials failure should raise a provider exception');
        } catch (SpeechProviderException $exception) {
            $this->assertSame('provider_unconfigured', $exception->errorCode);
            $this->assertFalse($exception->retryable);
            $this->assertStringNotContainsString('/home/deploy', $exception->getMessage(), 'provider messages must never carry host paths');
        }
    }

    public function test_a_rejected_voice_or_engine_is_not_retried(): void
    {
        $handler = new MockHandler;
        $handler->append(new AwsException('bad request', new Command('SynthesizeSpeech'), [
            'code' => 'ValidationException',
            'response' => new Response(400),
        ]));

        try {
            $this->synthesizer($handler)->synthesize(new SpeechRequest('你好。', 'normal', 'guide'));
            $this->fail('a validation failure should raise a provider exception');
        } catch (SpeechProviderException $exception) {
            $this->assertSame('unsupported_voice', $exception->errorCode);
            $this->assertFalse($exception->retryable);
        }
    }

    public function test_probe_checks_the_voice_and_engine_without_synthesizing(): void
    {
        $handler = new MockHandler;
        $handler->append(new Result(['Voices' => [['Id' => 'Zhiyu', 'SupportedEngines' => ['neural', 'standard']]]]));
        $ok = $this->synthesizer($handler)->probe();
        $this->assertTrue($ok->ok);
        $this->assertSame([], $ok->problems);
        $this->assertSame(['Zhiyu'], $ok->details['voices']);
        $this->assertSame('DescribeVoices', $handler->getLastCommand()->getName());

        $handler->append(new Result(['Voices' => [['Id' => 'Zhiyu', 'SupportedEngines' => ['standard']]]]));
        $wrongEngine = $this->synthesizer($handler)->probe();
        $this->assertFalse($wrongEngine->ok);
        $this->assertStringContainsString('does not support the neural engine', $wrongEngine->problems[0]);

        $handler->append(new Result(['Voices' => []]));
        $noVoice = $this->synthesizer($handler)->probe();
        $this->assertFalse($noVoice->ok);
        $this->assertStringContainsString('is not available', $noVoice->problems[0]);

        $handler->append(new CredentialsException('no credentials'));
        $unconfigured = $this->synthesizer($handler)->probe();
        $this->assertFalse($unconfigured->ok);
        $this->assertStringStartsWith('provider_unconfigured:', $unconfigured->problems[0]);
    }

    public function test_an_empty_audio_stream_is_a_retryable_failure(): void
    {
        $handler = new MockHandler;
        $handler->append(new Result(['AudioStream' => Utils::streamFor('')]));

        try {
            $this->synthesizer($handler)->synthesize(new SpeechRequest('你好。', 'normal', 'guide'));
            $this->fail('an empty stream should raise a provider exception');
        } catch (SpeechProviderException $exception) {
            $this->assertSame('provider_unavailable', $exception->errorCode);
            $this->assertTrue($exception->retryable);
        }
    }
}
