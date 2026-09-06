<?php

namespace App\Services\Games\Mandarin\Audio;

use App\Services\Games\Mandarin\Course\CourseValidator;
use App\Services\Games\Mandarin\Sfx\SfxRenderer;
use Normalizer;

/**
 * Cache identity for one generated object. Includes every input that changes
 * the audio (provider, voice, rate, format, template version, normalized
 * text) and nothing that does not (source id, role name, user, timestamps).
 */
final class AudioRecipe
{
    /**
     * @param  array<string, mixed>  $fields
     */
    private function __construct(
        public readonly string $kind,
        public readonly array $fields,
        public readonly string $hash,
    ) {}

    /**
     * @param  array<string, scalar|null>  $providerRecipe
     */
    public static function speech(array $providerRecipe, string $text): self
    {
        $normalized = self::normalizeText($text);
        $fields = $providerRecipe + ['text' => $normalized, 'kind' => 'speech'];

        return new self('speech', $fields, self::hashFields($fields));
    }

    public static function sfx(string $recipeId): self
    {
        $fields = ['kind' => 'sfx', 'provider' => 'procedural', 'recipe' => $recipeId, 'template' => SfxRenderer::RECIPE_VERSION, 'sampleRate' => SfxRenderer::SAMPLE_RATE];

        return new self('sfx', $fields, self::hashFields($fields));
    }

    /** NFC, trimmed, internal whitespace collapsed; Chinese punctuation preserved. */
    public static function normalizeText(string $text): string
    {
        $nfc = class_exists(Normalizer::class) ? (Normalizer::normalize($text, Normalizer::FORM_C) ?: $text) : $text;

        return trim((string) preg_replace('/\s+/u', ' ', $nfc));
    }

    /**
     * @param  array<string, mixed>  $fields
     */
    private static function hashFields(array $fields): string
    {
        return hash('sha256', CourseValidator::canonicalJson($fields));
    }

    /** Attach the story role for regeneration without changing identity. */
    public function withRole(string $role): self
    {
        return new self($this->kind, $this->fields + ['role' => $role], $this->hash);
    }

    public function withVariant(string $variant): self
    {
        return new self($this->kind, $this->fields + ['variant' => $variant], $this->hash);
    }

    public function text(): ?string
    {
        return isset($this->fields['text']) ? (string) $this->fields['text'] : null;
    }

    public function provider(): string
    {
        return (string) ($this->fields['provider'] ?? 'unknown');
    }
}
