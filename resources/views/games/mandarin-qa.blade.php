@extends('layouts.game')

@section('title', 'Mandarin audio QA')

{{-- A server-rendered audition sheet: no bundle, no client state, no generation.
     Everything below is what the published revision and the asset table
     actually contain — a line without audio says so rather than going quiet. --}}
@section('content')
  <div class="mx-auto max-w-3xl px-4 py-6">
    <header class="mb-6">
      <p class="text-sm text-muted-foreground">
        <a href="{{ route('games.mandarin') }}" class="text-primary hover:underline">&larr; Mandarin Quest</a>
      </p>
      <h1 class="mt-2 text-2xl font-semibold text-foreground">Audio QA</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ $course->courseId() }} @ {{ $course->contentVersion() }} &middot; every line in the published revision, with whatever audio exists today.
      </p>

      <dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div class="rounded-lg border border-border bg-card p-3">
          <dt class="text-xs uppercase tracking-wide text-muted-foreground">Provider</dt>
          <dd class="mt-1 font-medium text-foreground">{{ $providerId }}</dd>
          <dd class="text-xs text-muted-foreground">{{ $distinctVoices ? 'distinct role voices' : 'one voice for every role' }}</dd>
        </div>
        @foreach (['ready' => 'Ready', 'pending' => 'Queued / generating', 'failed' => 'Failed', 'unavailable' => 'Unavailable'] as $key => $label)
          <div class="rounded-lg border border-border bg-card p-3">
            <dt class="text-xs uppercase tracking-wide text-muted-foreground">{{ $label }}</dt>
            <dd class="mt-1 font-medium text-foreground">{{ $tally[$key] }}</dd>
          </div>
        @endforeach
      </dl>

      <p class="mt-3 text-sm text-muted-foreground">
        <span class="font-medium {{ $nativeReviewed ? 'text-foreground' : 'text-amber-600 dark:text-amber-400' }}">
          {{ $nativeReviewed ? 'Native-reviewed' : 'Not native-reviewed' }}
        </span>
        &middot;
        <span class="font-medium {{ $audioAuditioned ? 'text-foreground' : 'text-amber-600 dark:text-amber-400' }}">
          {{ $audioAuditioned ? 'Audio auditioned' : 'Audio not auditioned' }}
        </span>
      </p>
      <p class="mt-2 text-xs text-muted-foreground">
        This page never generates audio: it resolves read-only, so a missing line stays missing here.
        Use <code class="rounded bg-muted px-1 py-0.5">mandarin:audio:warm</code> to fill the cache.
      </p>
    </header>

    @foreach ($groups as $group)
      <section class="mb-8">
        <h2 class="text-lg font-semibold text-foreground">{{ $group['title'] }}</h2>
        <p class="mt-0.5 text-sm text-muted-foreground">{{ $group['note'] }}</p>

        <ul class="mt-3 space-y-3">
          @foreach ($group['items'] as $item)
            <li class="rounded-lg border border-border bg-card p-3">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <code class="text-xs text-muted-foreground">{{ $item['id'] }}</code>
                <span lang="zh-CN" class="text-xl font-medium text-foreground">{{ $item['zh'] }}</span>
                <span class="text-sm text-muted-foreground">{{ $item['pinyin'] }}</span>
              </div>
              <p class="mt-1 text-sm text-foreground">{{ $item['en'] }}</p>
              <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span class="rounded bg-muted px-1.5 py-0.5">{{ $item['role'] }}</span>
                <span class="rounded bg-muted px-1.5 py-0.5">{{ str_replace('_', ' ', $item['usage']) }}</span>
                @if ($item['reserved'])
                  <span class="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    Reserved for the listening check
                  </span>
                @endif
              </p>

              @if ($item['cells'] === [])
                <p class="mt-2 text-xs text-muted-foreground">This revision offers no audio variants for this source.</p>
              @else
                <div class="mt-2 space-y-2">
                  @foreach ($item['cells'] as $cell)
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span class="w-16 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{{ $cell['variant'] }}</span>
                      @if ($cell['ready'])
                        <audio controls preload="none" src="{{ $cell['url'] }}" class="h-8 max-w-full grow"></audio>
                        <span class="text-xs text-muted-foreground">
                          {{ $cell['provider'] ?? 'unknown provider' }}@if ($cell['voice']) &middot; {{ $cell['voice'] }}@endif
                          @if ($cell['durationMs']) &middot; {{ number_format($cell['durationMs'] / 1000, 1) }}s @endif
                        </span>
                      @else
                        <span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{{ $cell['label'] }}</span>
                      @endif
                    </div>
                  @endforeach
                </div>
              @endif
            </li>
          @endforeach
        </ul>
      </section>
    @endforeach
  </div>
@endsection
