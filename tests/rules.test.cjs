const test = require('node:test');
const assert = require('node:assert/strict');

test('失格の境界と失格なしの設定', async () => {
    const { default: rule } = await import('../js/rules/scoring/marks-eliminate.js');
    const player = { correct: 0, incorrect: 0 };
    for (let i = 0; i < 5; i++) rule.applyIncorrect(player);
    assert.equal(rule.isDisqualified(player, { loseCondition: 6 }), false);
    rule.applyIncorrect(player);
    assert.equal(rule.isDisqualified(player, { loseCondition: 6 }), true);
    assert.equal(rule.isDisqualified(player, { loseCondition: 0 }), false);
});

test('対決の通常解答・相手の解答権と誤答時の加点', async () => {
    const { default: rule } = await import('../js/rules/scoring/duel.js');
    const player = { correct: 0, incorrect: 0 },
        opponent = { duelPoints: 0 };
    rule.applyCorrect(player, { isOpponentResponse: false });
    assert.equal(rule.getScore(player), 2);
    rule.applyCorrect(player, { isOpponentResponse: true });
    assert.equal(rule.getScore(player), 3);
    rule.applyIncorrect(player, { opponent, isOpponentResponse: false });
    assert.equal(opponent.duelPoints, 1);
    rule.applyIncorrect(player, { opponent, isOpponentResponse: true });
    assert.equal(opponent.duelPoints, 1);
});
