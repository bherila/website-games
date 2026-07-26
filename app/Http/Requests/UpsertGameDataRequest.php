<?php

namespace App\Http\Requests;

use App\Enums\Games\GameDataScope;
use App\Rules\ValidGameDataPayload;

class UpsertGameDataRequest extends GameDataRouteRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $scope = GameDataScope::tryFrom((string) $this->route('scope'));

        return [
            ...parent::rules(),
            'data' => ['required', 'array', 'min:1', new ValidGameDataPayload($scope)],
        ];
    }

    /** @return array<string, mixed> */
    public function gameData(): array
    {
        /** @var array<string, mixed> $data */
        $data = $this->validated('data');

        return $data;
    }
}
