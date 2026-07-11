# Replay Notes

Replay substitutes only event source and clock; domain/application calculation paths remain shared with live mode. A replay identity comprises dataset hash, start/end, event-order policy, configuration versions, plugin versions, code revision, and random seed. Seeking restores the nearest compatible checkpoint and deterministically replays forward.
