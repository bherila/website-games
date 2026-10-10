<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Response;

/**
 * GET /admin — the operator panel. Routing puts it behind `auth` and the `administer` gate in
 * every environment; the page itself is a React shell fed by the JSON endpoints in
 * {@see MandarinAudioAdminController}.
 */
class AdminPanelController extends Controller
{
    public function __invoke(): Response
    {
        return response()->view('admin.index', [
            'panel' => [
                'usersUrl' => self::usersUrl(),
                'qaUrl' => route('games.mandarin.qa'),
                // The QA sheet 404s in production until the deployment switches it on.
                'qaAvailable' => ! app()->environment('production') || (bool) config('mandarin.qa_enabled'),
                'audio' => [
                    'index' => route('admin.mandarin.audio'),
                    'request' => route('admin.mandarin.audio.request'),
                    'regenerate' => route('admin.mandarin.audio.regenerate'),
                    'requestMissing' => route('admin.mandarin.audio.request-missing'),
                    'retryFailed' => route('admin.mandarin.audio.retry-failed'),
                ],
            ],
        ])->header('Cache-Control', 'no-store');
    }

    /**
     * The identity provider's user-management page for this application, or null when either
     * the provider's address or this application's key there is not configured.
     */
    public static function usersUrl(): ?string
    {
        $base = config('bherila-auth.oauth_client.base_url');
        $application = config('bherila-auth.delegated_access.application');
        if (! is_string($base) || trim($base) === '' || ! is_string($application) || trim($application) === '') {
            return null;
        }

        return rtrim(trim($base), '/').'/applications/'.rawurlencode(trim($application)).'/access';
    }
}
