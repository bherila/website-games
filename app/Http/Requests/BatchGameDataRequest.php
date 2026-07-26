<?php

namespace App\Http\Requests;

use App\Enums\Games\GameDataScope;
use App\Enums\Games\GameSlug;
use App\Rules\ValidGameDataPayload;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class BatchGameDataRequest extends FormRequest
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
            'operations' => ['required', 'array', 'list', 'min:1', 'max:50'],
            'operations.*' => ['required', 'array:action,scope,slot,data,revision,writer_id,writer_sequence'],
            'operations.*.action' => ['required', Rule::in(['put', 'delete'])],
            'operations.*.scope' => ['required', Rule::enum(GameDataScope::class)],
            'operations.*.slot' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9][A-Za-z0-9._:-]*$/'],
            'operations.*.data' => ['sometimes', 'array', 'min:1', new ValidGameDataPayload],
            'operations.*.revision' => ['nullable', 'integer', 'min:0'],
            'operations.*.writer_id' => ['nullable', 'uuid'],
            'operations.*.writer_sequence' => ['nullable', 'integer', 'min:1', 'max:9007199254740991'],
        ];
    }

    /** @return array<callable(Validator): void> */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $gameValue = $this->input('game');
            $game = is_string($gameValue) ? GameSlug::tryFrom($gameValue) : null;
            $operations = $this->input('operations');
            if (! $game || ! is_array($operations)) {
                return;
            }

            $seenAddresses = [];
            foreach ($operations as $index => $operation) {
                if (! is_array($operation)) {
                    continue;
                }

                $action = $operation['action'] ?? null;
                $scopeValue = $operation['scope'] ?? null;
                $scope = is_string($scopeValue) ? GameDataScope::tryFrom($scopeValue) : null;
                $slot = $operation['slot'] ?? null;
                if ($scope && is_string($slot) && ! $game->supports($scope, $slot)) {
                    $validator->errors()->add("operations.$index.slot", 'The selected slot is not available for this game and scope.');
                }
                if ($scope && is_string($slot)) {
                    $address = $scope->value."\0".$slot;
                    if (isset($seenAddresses[$address])) {
                        $validator->errors()->add("operations.$index.slot", 'Each game data address may appear only once per batch.');
                    }
                    $seenAddresses[$address] = true;
                }
                if ($action === 'put' && (! isset($operation['data']) || ! is_array($operation['data']) || $operation['data'] === [])) {
                    $validator->errors()->add("operations.$index.data", 'The data field is required for put operations.');
                }
                if ($action === 'delete' && array_key_exists('data', $operation)) {
                    $validator->errors()->add("operations.$index.data", 'The data field is not allowed for delete operations.');
                }
                $hasWriterId = isset($operation['writer_id']) && $operation['writer_id'] !== '';
                $hasWriterSequence = isset($operation['writer_sequence']) && $operation['writer_sequence'] !== '';
                if ($hasWriterId !== $hasWriterSequence) {
                    $validator->errors()->add("operations.$index.writer_id", 'The writer ID and sequence must be provided together.');
                }
                if ($scope !== GameDataScope::Save && ($hasWriterId || $hasWriterSequence)) {
                    $validator->errors()->add("operations.$index.writer_id", 'Writer ordering is available only for save data.');
                }
            }
        }];
    }

    public function gameSlug(): GameSlug
    {
        return GameSlug::from((string) $this->validated('game'));
    }

    /**
     * @return list<array{action: 'put'|'delete', scope: GameDataScope, slot: string, data: array<string, mixed>, revision: int|null, writer_id: string|null, writer_sequence: int|null}>
     */
    public function gameDataOperations(): array
    {
        /** @var list<array<string, mixed>> $validated */
        $validated = $this->validated('operations');

        return array_map(static function (array $operation): array {
            /** @var array<string, mixed> $data */
            $data = is_array($operation['data'] ?? null) ? $operation['data'] : [];

            return [
                'action' => $operation['action'] === 'delete' ? 'delete' : 'put',
                'scope' => GameDataScope::from((string) $operation['scope']),
                'slot' => (string) $operation['slot'],
                'data' => $data,
                'revision' => isset($operation['revision']) ? (int) $operation['revision'] : null,
                'writer_id' => is_string($operation['writer_id'] ?? null) ? $operation['writer_id'] : null,
                'writer_sequence' => isset($operation['writer_sequence']) ? (int) $operation['writer_sequence'] : null,
            ];
        }, $validated);
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['game' => $this->route('game')]);
    }
}
