export default Object.freeze({
    id: 'ny',
    label: 'NYルール',
    getScore(player) {
        return player.correct - player.incorrect;
    },
    applyCorrect(player) {
        player.correct++;
    },
    applyIncorrect(player) {
        player.incorrect++;
    },
    isDisqualified(player, settings) {
        return (
            settings.nyDisqualification > 0 &&
            player.correct - player.incorrect <= -settings.nyDisqualification
        );
    },
    getPresentation(player) {
        return { type: 'points', value: player.correct - player.incorrect };
    },
});
