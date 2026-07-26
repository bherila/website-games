<?php

namespace App\Http\Requests;

use App\Enums\Games\GameDataScope;
use App\Enums\Games\GameSlug;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class GameDataRouteRequest extends FormRequest
{
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
            'game' => ['required', Rule::enum(GameSlug::class)],
            'scope' => ['required', Rule::enum(GameDataScope::class)],
            'slot' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9][A-Za-z0-9._:-]*$/'],
            'revision' => ['nullable', 'integer', 'min:0'],
            'writer_id' => ['nullable', 'uuid', 'required_with:writer_sequence'],
            'writer_sequence' => ['nullable', 'integer', 'min:1', 'max:9007199254740991', 'required_with:writer_id'],
        ];
    }

    public function messages(): array
    {
        return [
            'game.enum' => 'The selected game does not support database saves.',
            'scope.enum' => 'The selected game data scope is invalid.',
            'slot.regex' => 'The slot may contain only letters, numbers, periods, underscores, colons, and hyphens.',
        ];
    }

    public function gameSlug(): GameSlug
    {
        return GameSlug::from((string) $this->validated('game'));
    }

    public function dataScope(): GameDataScope
    {
        return GameDataScope::from((string) $this->validated('scope'));
    }

    public function slotKey(): string
    {
        return (string) $this->validated('slot');
    }

    public function expectedRevision(): ?int
    {
        $revision = $this->validated('revision');

        return $revision === null ? null : (int) $revision;
    }

    public function writerId(): ?string
    {
        $writerId = $this->validated('writer_id');

        return is_string($writerId) ? $writerId : null;
    }

    public function writerSequence(): ?int
    {
        $writerSequence = $this->validated('writer_sequence');

        return $writerSequence === null ? null : (int) $writerSequence;
    }

    /** @return array<callable(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $game = GameSlug::tryFrom((string) $this->input('game'));
            $scope = GameDataScope::tryFrom((string) $this->input('scope'));
            $slot = $this->input('slot');

            if ($game && $scope && is_string($slot) && ! $game->supports($scope, $slot)) {
                $validator->errors()->add('slot', 'The selected slot is not available for this game and scope.');
            }
            if ($scope !== GameDataScope::Save && ($this->filled('writer_id') || $this->filled('writer_sequence'))) {
                $validator->errors()->add('writer_id', 'Writer ordering is available only for save data.');
            }
        }];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'game' => $this->route('game'),
            'scope' => $this->route('scope'),
            'slot' => $this->route('slot'),
        ]);
    }
}
