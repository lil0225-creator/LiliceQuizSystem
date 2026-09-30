export default Object.freeze({
    id: 'suitei-duel',
    label: '対決ルール',
    getScore(player) {
        return Number.isFinite(player.duelPoints) ? player.duelPoints : 0;
    },
    applyCorrect(player, settings) {
        player.correct++;
        const points = settings.isOpponentResponse ? 1 : 2;
        player.duelPoints = (player.duelPoints || 0) + points;
        return points;
    },
    applyIncorrect(player, settings) {
        player.incorrect++;
        if (settings.isOpponentResponse) return 0;
        if (settings.opponent)
            settings.opponent.duelPoints = (settings.opponent.duelPoints || 0) + 1;
        return 1;
    },
    isDisqualified() {
        return false;
    },
    getPresentation(player) {
        return {
            type: 'points',
            value: Number.isFinite(player.duelPoints) ? player.duelPoints : 0,
        };
    },
});
