<?php

namespace App\Services\Games\Mandarin\Speech;

/**
 * Local-development provider built on macOS `say` + `afconvert`.
 *
 * Discovers installed Mainland Mandarin (zh_CN) voices instead of assuming a
 * name, assigns them to story roles stably, and refuses to read Chinese with a
 * non-Mandarin voice. Output is AAC in an M4A container, which every target
 * browser decodes. Environments: local/development only — check Apple's voice
 * licensing before distributing a large corpus generated this way.
 */
class MacOsSpeechSynthesizer implements SpeechSynthesizer
{
    public const RECIPE_VERSION = 'macos-say-v1';

    /** Preferred voices first; the rest of the installed zh_CN list follows alphabetically. */
    private const PREFERRED = ['Tingting'];

    /** @var list<string>|null */
    private ?array $voices = null;

    /**
     * @param  array<string, string>  $roleVoices  explicit role → voice overrides
     */
    public function __construct(
        private readonly ProcessRunner $runner,
        private readonly string $sayBinary = '/usr/bin/say',
        private readonly string $afconvertBinary = '/usr/bin/afconvert',
        private readonly int $normalRate = 150,
        private readonly int $slowRate = 125,
        private readonly array $roleVoices = [],
        private readonly ?string $tempDir = null,
    ) {}

    public function id(): string
    {
        return 'macos';
    }

    public function recipe(SpeechRequest $request): array
    {
        return [
            'provider' => 'macos',
            'engine' => 'say',
            'voice' => $this->voiceFor($request->role),
            'language' => 'zh_CN',
            'rate' => $request->variant === 'slow' ? $this->slowRate : $this->normalRate,
            'format' => 'm4a/aac',
            'sampleRate' => 22050,
            'template' => self::RECIPE_VERSION,
        ];
    }

    public function synthesize(SpeechRequest $request): SynthesizedAudio
    {
        $voice = $this->voiceFor($request->role);
        $dir = $this->tempDir ?? sys_get_temp_dir();
        $base = $dir.DIRECTORY_SEPARATOR.'mandarin-'.bin2hex(random_bytes(8));
        $aiff = $base.'.aiff';
        $m4a = $base.'.m4a';
        try {
            $say = $this->runner->run([
                $this->sayBinary,
                '-v', $voice,
                '-r', (string) ($request->variant === 'slow' ? $this->slowRate : $this->normalRate),
                '-o', $aiff,
                '--', $request->text,
            ], 60);
            if (! $say->ok() || ! is_file($aiff)) {
                throw new SpeechProviderException('provider_unavailable', 'say failed: '.trim($say->stderr), $say->exitCode === 124);
            }
            $convert = $this->runner->run([$this->afconvertBinary, '-f', 'm4af', '-d', 'aac', '-b', '64000', $aiff, $m4a], 60);
            if (! $convert->ok() || ! is_file($m4a)) {
                throw new SpeechProviderException('provider_unavailable', 'afconvert failed: '.trim($convert->stderr));
            }
            $bytes = (string) file_get_contents($m4a);
        } finally {
            @unlink($aiff);
            @unlink($m4a);
        }

        return new SynthesizedAudio($bytes, 'audio/mp4', 'm4a', mb_strlen($request->text), [
            'voice' => $voice,
            'rate' => $request->variant === 'slow' ? $this->slowRate : $this->normalRate,
            'tool' => 'say+afconvert',
        ]);
    }

    public function probe(): ProviderProbe
    {
        if (PHP_OS_FAMILY !== 'Darwin') {
            return new ProviderProbe(false, ['The macOS provider only runs on macOS (PHP_OS_FAMILY='.PHP_OS_FAMILY.').']);
        }
        $problems = [];
        foreach ([$this->sayBinary, $this->afconvertBinary] as $binary) {
            if (! is_executable($binary)) {
                $problems[] = "{$binary} is not executable.";
            }
        }
        $voices = $problems === [] ? $this->installedVoices() : [];
        if ($problems === [] && $voices === []) {
            $problems[] = 'No zh_CN (Mainland Mandarin) system voice is installed. Add one under System Settings → Accessibility → Read & Speak → System voice.';
        }

        return new ProviderProbe($problems === [], $problems, [
            'voices' => $voices,
            'roles' => $voices === [] ? [] : ['narrator' => $this->voiceFor('narrator'), 'guide' => $this->voiceFor('guide'), 'traveler' => $this->voiceFor('traveler'), 'friend' => $this->voiceFor('friend')],
            'distinctVoices' => $this->hasDistinctMandarinVoices(),
        ]);
    }

    public function hasDistinctMandarinVoices(): bool
    {
        return count(array_unique([$this->voiceFor('guide'), $this->voiceFor('traveler'), $this->voiceFor('friend')])) > 1;
    }

    /** @return list<string> installed zh_CN voice names, preferred first */
    public function installedVoices(): array
    {
        if ($this->voices !== null) {
            return $this->voices;
        }
        $result = $this->runner->run([$this->sayBinary, '-v', '?'], 30);
        $names = [];
        foreach (preg_split('/\R/', $result->stdout) ?: [] as $line) {
            // "Tingting            zh_CN    # 你好！我叫婷婷。" or "Eddy (Chinese (China mainland)) zh_CN    # …"
            if (preg_match('/^(.+?)\s+zh_CN\s+#/u', $line, $match) === 1) {
                $names[] = trim($match[1]);
            }
        }
        $names = array_values(array_unique($names));
        usort($names, static function (string $a, string $b): int {
            $ia = array_search($a, self::PREFERRED, true);
            $ib = array_search($b, self::PREFERRED, true);
            if ($ia !== false || $ib !== false) {
                return ($ia === false ? PHP_INT_MAX : $ia) <=> ($ib === false ? PHP_INT_MAX : $ib);
            }

            return strcmp($a, $b);
        });

        return $this->voices = $names;
    }

    /** Stable role → voice assignment: explicit config, then the preferred voice for narrator/guide, then distinct voices per role when installed. */
    public function voiceFor(string $role): string
    {
        if (isset($this->roleVoices[$role]) && $this->roleVoices[$role] !== '') {
            return $this->roleVoices[$role];
        }
        $voices = $this->installedVoices();
        if ($voices === []) {
            throw new SpeechProviderException('unsupported_voice', 'No zh_CN system voice is installed; refusing to read Mandarin with another language\'s voice.');
        }
        $slot = match ($role) {
            'traveler' => 1,
            'friend' => 2,
            default => 0,
        };

        return $voices[$slot] ?? $voices[0];
    }
}
