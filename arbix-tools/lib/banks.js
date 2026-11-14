// Canonical banks and their identifiers on each exchange (checked on live P2P data, Nov 2026).
// binance: payTypes identifier; okx: names in paymentMethods; bybit: payment ids.
export const BANKS = {
  mono:    { label: 'Monobank',      binance: ['Monobank'],           okx: ['Monobank (Card)'],                    bybit: ['43'] },
  privat:  { label: 'ПриватБанк',    binance: ['PrivatBank'],         okx: ['PrivatBank (CARD)'],                  bybit: ['60', '660'] },
  pumb:    { label: 'ПУМБ',          binance: ['PUMBBank'],           okx: ['PUMB (CARD)'],                        bybit: ['61'] },
  abank:   { label: 'A-Bank',        binance: ['ABank'],              okx: ['A-Bank (CARD)'],                      bybit: ['1'] },
  sense:   { label: 'Sense',         binance: ['SenseSuperApp'],      okx: ['Sense SuperApp (CARD)'],              bybit: ['623'] },
  oschad:  { label: 'Ощадбанк',      binance: ['Oschadbank'],         okx: ['Oschad bank (CARD)', 'Oschad Bank'],  bybit: ['46'] },
  raif:    { label: 'Райффайзен',    binance: ['RaiffeisenBankAval'], okx: ['Raiffeisen Bank (CARD)'],             bybit: ['63'] },
  izi:     { label: 'Izibank',       binance: ['izibank'],            okx: ['Izibank (CARD)'],                     bybit: ['544'] },
  otp:     { label: 'OTP Bank',      binance: ['OTPBankNew'],         okx: ['OTP Bank (CARD)'],                    bybit: ['49'] },
  ukrsib:  { label: 'УкрСиббанк',    binance: ['Ukrsibbank'],         okx: ['Ukrsibbank'],                         bybit: ['80'] },
};
export const EXCHANGES = ['binance', 'okx', 'bybit'];
