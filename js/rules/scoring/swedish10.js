function getSwedishPenalty(correctCount) {
    if (correctCount === 0) return 1;
    if (correctCount <= 2) return 2;
    if (correctCount <= 5) return 3;
    return 4;
}

export default Object.freeze({
    id: 'swedish10',
    label: 'Swedish10',
    getScore(player) {
        return player.correct;
    },
    applyCorrect(player) {
        player.correct++;
    },
    applyIncorrect(player) {
        player.incorrect++;
        player.swedishPenaltyMarks = (player.swedishPenaltyMarks || 0) + getSwedishPenalty(player.correct);
    },
    isDisqualified(player, settings) {
        return settings.loseCondition > 0 && (player.swedishPenaltyMarks || 0) >= settings.loseCondition;
    },
    getPresentation(player) {
        return { type: 'penalty-marks', correct: player.correct, penaltyMarks: player.swedishPenaltyMarks || 0 };
    }
});