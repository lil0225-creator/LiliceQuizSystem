export const answerModes = Object.freeze([
    Object.freeze({ id: 'single', label: 'シングル', incorrectAction: 'end', queueLimit: 1 }),
    Object.freeze({ id: 'endless', label: 'エンドレス', incorrectAction: 'advance', queueLimit: null }),
    Object.freeze({ id: 'second', label: '2着切り', incorrectAction: 'advance-if-queued', queueLimit: 2 }),
    Object.freeze({ id: 'duel', label: '1対1対決', incorrectAction: 'duel-response', queueLimit: 1 })
]);