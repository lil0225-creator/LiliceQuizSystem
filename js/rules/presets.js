export const rulePresets = Object.freeze([
    Object.freeze({
        id: '5-2',
        label: '5〇2×',
        description: '5〇で勝ち抜け、2×で失格。誤答後は次の解答者へ進む。',
        scoreRule: 'marks-eliminate', answerMode: 'endless', winCondition: 5, loseCondition: 2, restQuestions: 1, nyDisqualification: 0
    }),
    Object.freeze({
        id: '7-3',
        label: '7〇3×',
        description: '7〇で勝ち抜け、3×で失格。誤答後は次の解答者へ進む。',
        scoreRule: 'marks-eliminate', answerMode: 'endless', winCondition: 7, loseCondition: 3, restQuestions: 1, nyDisqualification: 0
    }),
    Object.freeze({
        id: '10-0',
        label: '10〇0×',
        description: '10〇で勝ち抜け。失格条件なし。誤答後は次の解答者へ進む。',
        scoreRule: 'marks-eliminate', answerMode: 'endless', winCondition: 10, loseCondition: 0, restQuestions: 1, nyDisqualification: 0
    }),
    Object.freeze({
        id: '5-rest',
        label: '5〇1休',
        description: '5〇で勝ち抜け。誤答した人は次の1問を休む。',
        scoreRule: 'marks-rest', answerMode: 'endless', winCondition: 5, loseCondition: 2, restQuestions: 1, nyDisqualification: 0
    }),
    Object.freeze({
        id: '7-up-down',
        label: '7 Up/Down',
        description: '正解で+1。初回誤答で点数を0に戻す。7点到達で勝ち抜け、失格なし。',
        scoreRule: 'up-down', answerMode: 'endless', winCondition: 7, loseCondition: 0, restQuestions: 1, nyDisqualification: 0
    }),
    Object.freeze({
        id: '10-up-down',
        label: '10 Up/Down',
        description: '10点で勝ち抜け。最初の誤答で点数を0に戻し、通算2誤答で失格。',
        scoreRule: 'up-down', answerMode: 'endless', winCondition: 10, loseCondition: 2, restQuestions: 1, nyDisqualification: 0
    }),
    Object.freeze({
        id: 'freeze10',
        label: 'Freeze10',
        description: '10〇で勝ち抜け。n回目の誤答でn問休み、失格なし。',
        scoreRule: 'freeze', answerMode: 'endless', winCondition: 10, loseCondition: 0, restQuestions: 0, nyDisqualification: 0
    }),
    Object.freeze({
        id: 'swedish10',
        label: 'Swedish10',
        description: '10〇で勝ち抜け。誤答時の累計×数は正解数に応じて増え、10×で失格。',
        scoreRule: 'swedish10', answerMode: 'endless', winCondition: 10, loseCondition: 10, restQuestions: 0, nyDisqualification: 0
    }),
    Object.freeze({
        id: '10by10',
        label: '10by10',
        description: 'α=正解数、β=10−誤答数。α×βが100で勝ち抜け、6誤答で失格。',
        scoreRule: 'ten-by-ten', answerMode: 'endless', winCondition: 100, loseCondition: 6, restQuestions: 0, nyDisqualification: 0
    }),
    Object.freeze({
        id: 'duel-rule',
        label: '対決ルール',
        description: '2人限定。早押し正解で+2点、誤答で相手に+1点。問題文を読み切った後、相手が自分のキーを押して回答権を得ます。相手正解でさらに+1点。先に15点へ到達した側が勝利。',
        scoreRule: 'suitei-duel', answerMode: 'duel', winCondition: 15, loseCondition: 0, restQuestions: 0, nyDisqualification: 0
    })
]);