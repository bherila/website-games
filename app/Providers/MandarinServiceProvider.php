<?php

namespace App\Providers;

use App\Services\Games\Mandarin\Audio\AudioValidator;
use App\Services\Games\Mandarin\Audio\GenerationBudget;
use App\Services\Games\Mandarin\Speech\ProcessRunner;
use App\Services\Games\Mandarin\Speech\SpeechProviderFactory;
use App\Services\Games\Mandarin\Speech\SpeechSynthesizer;
use App\Services\Games\Mandarin\Speech\SymfonyProcessRunner;
use Illuminate\Contracts\Cache\Factory as CacheFactory;
use Illuminate\Support\ServiceProvider;

class MandarinServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(ProcessRunner::class, SymfonyProcessRunner::class);
        $this->app->singleton(SpeechSynthesizer::class, fn ($app): SpeechSynthesizer => $app->make(SpeechProviderFactory::class)->make());
        $this->app->bind(AudioValidator::class, fn ($app): AudioValidator => new AudioValidator(
            $app->make(ProcessRunner::class),
            (string) config('mandarin.audio.ffprobe', 'ffprobe') ?: null,
        ));
        $this->app->bind(GenerationBudget::class, fn ($app): GenerationBudget => new GenerationBudget(
            $app->make(CacheFactory::class)->store(),
            (int) config('mandarin.speech.daily_character_budget', 20000),
        ));
    }
}
