<?php

namespace App\Http\Controllers\Api\Mandarin;

use App\Http\Controllers\Controller;
use App\Models\Mandarin\MandarinAudioAsset;
use App\Services\Games\Mandarin\Audio\AudioDeliveryService;
use Symfony\Component\HttpFoundation\Response;

/**
 * GET/HEAD media for one ready, content-hashed asset. Only original course
 * audio lives here; the hash in the URL means an old link can never play
 * different speech.
 */
class MandarinMediaController extends Controller
{
    public function show(int $asset, string $hash, string $extension, AudioDeliveryService $delivery): Response
    {
        $row = MandarinAudioAsset::query()->find($asset);
        if ($row === null || ! $row->isReady() || $row->content_hash !== $hash || $delivery->extension($row) !== $extension) {
            abort(404);
        }
        if (! $delivery->objectExists($row)) {
            abort(404);
        }

        return $delivery->respond($row);
    }
}
