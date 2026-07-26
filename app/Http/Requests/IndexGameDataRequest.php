<?php

namespace App\Http\Requests;

use App\Enums\Games\GameSlug;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexGameDataRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // Game Select requests every database-backed game at once, so the
            // ceiling is the supported-game count rather than a literal that
            // has to be remembered whenever a game is added.
            'games' => ['sometimes', 'array', 'min:1', 'max:'.count(GameSlug::cases())],
            'games.*' => ['required', 'distinct', Rule::enum(GameSlug::class)],
            'include_saves' => ['sometimes', 'boolean'],
        ];
    }

    /** @return list<GameSlug>|null */
    public function gameSlugs(): ?array
    {
        $games = $this->validated('games');
        if (! is_array($games)) {
            return null;
        }

        return array_map(
            static fn (mixed $game): GameSlug => GameSlug::from((string) $game),
            array_values($games),
        );
    }

    public function includesSaves(): bool
    {
        return $this->boolean('include_saves', true);
    }
}
