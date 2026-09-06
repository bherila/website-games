<?php

namespace App\Http\Requests\Mandarin;

use Illuminate\Foundation\Http\FormRequest;

class AppendPracticeEventsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $max = (int) config('mandarin.events.max_batch', 64);

        return [
            'events' => ['present', 'array', "max:{$max}"],
            'events.*' => ['array'],
            'events.*.clientEventId' => ['required', 'string', 'max:64'],
        ];
    }

    /** @return list<array<string, mixed>> */
    public function events(): array
    {
        // Per-event content is validated (and individually rejected) by the service; only the batch shape is enforced here.
        /** @var list<array<string, mixed>> $events */
        $events = array_values(array_filter((array) $this->input('events', []), 'is_array'));

        return $events;
    }
}
