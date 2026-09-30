function getBeta(player, settings) {
    const base = Number.isFinite(settings.tenByTenBase) ? settings.tenByTenBase : 10;
    return Math.max(0, base - player.incorrect);
}

export default Object.freeze({
    id: 'ten-by-ten',
    label: '10by10',
    getScore(player, settings) {
        return player.correct * getBeta(player, settings);
    },
    applyCorrect(player) {
        player.correct++;
    },
    applyIncorrect(player) {
        player.incorrect++;
    },
    isDisqualified(player, settings) {
        return settings.loseCondition > 0 && player.incorrect >= settings.loseCondition;
    },
    getPresentation(player, settings) {
        const beta = getBeta(player, settings);
        return { type: 'product', alpha: player.correct, beta, value: player.correct * beta };
    },
});
