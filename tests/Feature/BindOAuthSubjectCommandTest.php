<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Tests\TestCase;

/**
 * Linking an account to a provider subject is the one place this app writes the binding that
 * every later sign-in trusts. Get it wrong and one person's saved games resolve to another
 * account, so each guard below is asserted rather than left to the operator's care.
 */
class BindOAuthSubjectCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('services.identity_provider.name', 'bherila');
    }

    public function test_it_links_an_account_that_has_no_subject_yet(): void
    {
        $user = User::factory()->create();

        $this->artisan('oauth:bind-subject', ['user' => $user->getKey(), 'subject' => 'subject-a'])
            ->assertSuccessful();

        $this->assertDatabaseHas('users', [
            'id' => $user->getKey(),
            'oauth_provider' => 'bherila',
            'oauth_subject' => 'subject-a',
        ]);
    }

    public function test_it_uses_an_explicit_provider_over_the_configured_one(): void
    {
        $user = User::factory()->create();

        $this->artisan('oauth:bind-subject', [
            'user' => $user->getKey(),
            'subject' => 'subject-a',
            '--provider' => 'other-provider',
        ])->assertSuccessful();

        $this->assertSame('other-provider', $user->fresh()?->oauth_provider);
    }

    /**
     * Re-running the same link must not be an error; an operator who is unsure whether a
     * correction landed should be able to run it again rather than go poking at the database.
     */
    public function test_relinking_the_same_subject_is_a_no_op(): void
    {
        $user = User::factory()->create();
        $user->forceFill(['oauth_provider' => 'bherila', 'oauth_subject' => 'subject-a'])->save();

        $this->artisan('oauth:bind-subject', ['user' => $user->getKey(), 'subject' => 'subject-a'])
            ->assertSuccessful();

        $this->assertSame('subject-a', $user->fresh()?->oauth_subject);
    }

    public function test_it_refuses_to_repoint_an_account_that_is_already_linked(): void
    {
        $user = User::factory()->create();
        $user->forceFill(['oauth_provider' => 'bherila', 'oauth_subject' => 'subject-a'])->save();

        $this->artisan('oauth:bind-subject', ['user' => $user->getKey(), 'subject' => 'subject-b'])
            ->assertFailed();

        $this->assertSame('subject-a', $user->fresh()?->oauth_subject);
    }

    public function test_it_refuses_to_give_one_subject_to_a_second_account(): void
    {
        $bound = User::factory()->create();
        $bound->forceFill(['oauth_provider' => 'bherila', 'oauth_subject' => 'subject-a'])->save();
        $other = User::factory()->create();

        $this->artisan('oauth:bind-subject', ['user' => $other->getKey(), 'subject' => 'subject-a'])
            ->assertFailed();

        $this->assertNull($other->fresh()?->oauth_subject);
        $this->assertSame($bound->getKey(), User::query()->where('oauth_subject', 'subject-a')->sole()->getKey());
    }

    public function test_it_refuses_an_unknown_account(): void
    {
        $this->artisan('oauth:bind-subject', ['user' => 999999, 'subject' => 'subject-a'])
            ->assertFailed();

        $this->assertDatabaseCount('users', 0);
    }

    public function test_it_refuses_an_empty_subject(): void
    {
        $user = User::factory()->create();

        $this->artisan('oauth:bind-subject', ['user' => $user->getKey(), 'subject' => '   '])
            ->assertFailed();

        $this->assertNull($user->fresh()?->oauth_subject);
    }

    public function test_it_refuses_a_subject_longer_than_the_column(): void
    {
        $user = User::factory()->create();

        $this->artisan('oauth:bind-subject', ['user' => $user->getKey(), 'subject' => str_repeat('s', 192)])
            ->assertFailed();

        $this->assertNull($user->fresh()?->oauth_subject);
    }

    public function test_it_refuses_when_no_provider_is_configured_or_given(): void
    {
        Config::set('services.identity_provider.name', '');
        $user = User::factory()->create();

        $this->artisan('oauth:bind-subject', ['user' => $user->getKey(), 'subject' => 'subject-a'])
            ->assertFailed();

        $this->assertNull($user->fresh()?->oauth_subject);
    }
}
