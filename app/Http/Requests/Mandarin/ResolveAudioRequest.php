<?php

namespace App\Http\Requests\Mandarin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ResolveAudioRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // guests may resolve cache hits; generation is gated in the service
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'courseId' => ['required', 'string', 'max:64'],
            'contentVersion' => ['required', 'string', 'max:32'],
            'sources' => ['required', 'array', 'min:1', 'max:16'],
            'sources.*.sourceKind' => ['required', Rule::in(['utterance', 'target', 'sfx'])],
            'sources.*.sourceId' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'],
            'sources.*.variant' => ['required', Rule::in(['normal', 'slow', 'default'])],
        ];
    }

    /** @return list<array{sourceKind: string, sourceId: string, variant: string}> */
    public function sources(): array
    {
        /** @var list<array{sourceKind: string, sourceId: string, variant: string}> $sources */
        $sources = array_values($this->validated('sources'));

        return $sources;
    }
}
