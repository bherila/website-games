<?php

namespace App\Http\Resources;

use App\Models\UserGameData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserGameDataResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var UserGameData $row */
        $row = $this->resource;

        return [
            'game' => $row->game->value,
            'scope' => $row->scope->value,
            'slot' => $row->slot,
            'data' => $row->is_deleted ? (object) [] : $row->data,
            'revision' => $row->revision,
            'is_deleted' => $row->is_deleted,
            'created_at' => $row->created_at?->format('Y-m-d H:i:s'),
            'updated_at' => $row->updated_at?->format('Y-m-d H:i:s'),
        ];
    }
}
