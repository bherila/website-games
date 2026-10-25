{{-- Shared by /privacy and /accessibility. Errors are tied to their fields with aria-describedby,
     and the confirmation is announced through a status region. --}}
@php($topicDefault = old('topic', $topic ?? null))
<section id="request" aria-labelledby="request-heading" class="scroll-mt-6">
    <h2 id="request-heading" class="text-lg font-semibold">{{ $heading }}</h2>
    @if (session('privacy_request_sent'))
        <p role="status" class="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
            Thanks, we received your request and emailed you a confirmation. We will reply within {{ \App\Services\Privacy\PrivacyRequests::RESPONSE_DAYS }} days.
        </p>
    @endif
    @if (\App\Services\Privacy\PrivacyRequests::enabled())
        <form method="POST" action="{{ route('privacy.request') }}" class="mt-3 flex flex-col gap-4" novalidate>
            @csrf
            <input type="hidden" name="return" value="{{ $return }}">
            <div>
                <label for="request-email" class="block font-medium">Your email address</label>
                <input id="request-email" name="email" type="email" required autocomplete="email" value="{{ old('email', auth()->user()?->email) }}"
                    @error('email') aria-invalid="true" aria-describedby="request-email-error" @enderror
                    class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground">
                @error('email')<p id="request-email-error" class="mt-1 text-rose-700 dark:text-rose-300">{{ $message }}</p>@enderror
            </div>
            <div>
                <label for="request-topic" class="block font-medium">What would you like?</label>
                <select id="request-topic" name="topic" required
                    @error('topic') aria-invalid="true" aria-describedby="request-topic-error" @enderror
                    class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground">
                    @foreach (\App\Services\Privacy\PrivacyRequests::TOPICS as $value => $label)
                        <option value="{{ $value }}" @selected($topicDefault === $value)>{{ $label }}</option>
                    @endforeach
                </select>
                @error('topic')<p id="request-topic-error" class="mt-1 text-rose-700 dark:text-rose-300">{{ $message }}</p>@enderror
            </div>
            <div>
                <label for="request-message" class="block font-medium">Details <span class="font-normal text-muted-foreground">(optional)</span></label>
                <textarea id="request-message" name="message" rows="4" maxlength="5000"
                    @error('message') aria-invalid="true" aria-describedby="request-message-error" @enderror
                    class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground">{{ old('message') }}</textarea>
                @error('message')<p id="request-message-error" class="mt-1 text-rose-700 dark:text-rose-300">{{ $message }}</p>@enderror
            </div>
            {{-- Left empty by people; hidden from sight, from assistive technology and from tabbing. --}}
            <div class="hidden" aria-hidden="true">
                <label for="request-website">Website</label>
                <input id="request-website" name="website" type="text" tabindex="-1" autocomplete="off">
            </div>
            <p class="text-muted-foreground">We use your email only to answer this request. We do not keep the request on the site.</p>
            <div>
                <button type="submit" class="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Send request</button>
            </div>
        </form>
    @else
        <p class="mt-2">Signed-in players can see, correct and delete their information on the <a href="{{ route('account.show') }}" class="font-medium text-primary underline underline-offset-2">Account page</a>. Our request form will appear here once email delivery is set up.</p>
    @endif
</section>
