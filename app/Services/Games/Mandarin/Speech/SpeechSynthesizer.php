<?php

namespace App\Services\Games\Mandarin\Speech;

/**
 * Verified provider request → bounded binary speech. Implementations resolve
 * the voice from the role and never accept client text, SSML, model or URL
 * overrides. The recipe is what gets hashed for cache identity, so it must
 * contain every input that changes the audio and nothing that does not.
 */
interface SpeechSynthesizer
{
    /** Stable provider id used in recipes ('macos', 'polly', 'null'). */
    public function id(): string;

    /**
     * Deterministic resolved settings for a request, excluding the text.
     *
     * @return array<string, scalar|null>
     */
    public function recipe(SpeechRequest $request): array;

    /** @throws SpeechProviderException */
    public function synthesize(SpeechRequest $request): SynthesizedAudio;

    /** Cheap, free capability check (no paid synthesis). */
    public function probe(): ProviderProbe;

    /** Whether the same actual voice reads every role. */
    public function hasDistinctMandarinVoices(): bool;
}
