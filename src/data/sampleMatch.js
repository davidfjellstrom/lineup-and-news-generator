// Turkey vs Portugal – UEFA Euro 2024 Group F, 22 June 2024
function p(number, firstName, lastName, position, clubName, isStarter) {
  return {
    id: crypto.randomUUID(),
    number,
    firstName: firstName.toUpperCase(),
    lastName: lastName.toUpperCase(),
    position,
    photo: '',
    clubLogo: '',
    clubName,
    notes: '',
    isStarter,
  }
}

const turkey = {
  name: 'TURKEY',
  flag: '🇹🇷',
  formation: '4-3-3',
  coach: 'VINCENZO MONTELLA',
  players: [
    // Starters
    p(1,  'ALTAY',   'BAYINDIR',      'GK',  'Manchester Utd',  true),
    p(4,  'FERDI',   'KADIOGLU',      'DEF', 'Fenerbahçe',      true),
    p(3,  'MERIH',   'DEMIRAL',       'DEF', 'Al-Qadsiah',      true),
    p(5,  'SAMET',   'AKAYDIN',       'DEF', 'Sevilla',         true),
    p(2,  'ZEKI',    'CELIK',         'DEF', 'Roma',            true),
    p(6,  'KAAN',    'AYHAN',         'MID', 'Galatasaray',     true),
    p(10, 'HAKAN',   'CALHANOGLU',    'MID', 'Inter Milan',     true),
    p(8,  'SALIH',   'OZCAN',         'MID', 'Dortmund',        true),
    p(11, 'KEREM',   'AKTURKOGLU',    'FWD', 'Galatasaray',     true),
    p(7,  'ARDA',    'GULER',         'FWD', 'Real Madrid',     true),
    p(17, 'BARIS',   'YILMAZ',        'FWD', 'Galatasaray',     true),
    // Substitutes
    p(22, 'UGURCAN', 'CAKIR',         'GK',  'Trabzonspor',     false),
    p(21, 'MERT',    'MULDUR',        'DEF', 'Hellas Verona',   false),
    p(12, 'ABDULKADIR', 'UNSAL',      'DEF', 'Galatasaray',     false),
    p(18, 'ORKUN',   'KOKCU',         'MID', 'Benfica',         false),
    p(14, 'IRFAN',   'KAHVECI',       'MID', 'Fenerbahçe',      false),
    p(9,  'CENK',    'TOSUN',         'FWD', 'Beşiktaş',        false),
    p(16, 'YUNUS',   'AKGUN',         'FWD', 'Galatasaray',     false),
    p(23, 'HALIL',   'DERVIŞOGLU',    'FWD', 'Bari',            false),
  ],
}

const portugal = {
  name: 'PORTUGAL',
  flag: '🇵🇹',
  formation: '4-3-3',
  coach: 'ROBERTO MARTINEZ',
  players: [
    // Starters
    p(1,  'DIOGO',    'COSTA',        'GK',  'FC Porto',        true),
    p(20, 'JOAO',     'CANCELO',      'DEF', 'Barcelona',       true),
    p(6,  'RUBEN',    'DIAS',         'DEF', 'Man City',        true),
    p(3,  '',         'PEPE',         'DEF', 'FC Porto',        true),
    p(22, 'NUNO',     'MENDES',       'DEF', 'PSG',             true),
    p(26, 'JOAO',     'PALHINHA',     'MID', 'Bayern Munich',   true),
    p(16, '',         'VITINHA',      'MID', 'PSG',             true),
    p(10, 'BERNARDO', 'SILVA',        'MID', 'Man City',        true),
    p(11, 'DIOGO',    'JOTA',         'FWD', 'Liverpool',       true),
    p(7,  'CRISTIANO','RONALDO',      'FWD', 'Al Nassr',        true),
    p(17, 'RAFAEL',   'LEAO',         'FWD', 'AC Milan',        true),
    // Substitutes
    p(23, 'JOSE',     'SA',           'GK',  'Wolverhampton',   false),
    p(2,  'DIOGO',    'DALOT',        'DEF', 'Man United',      false),
    p(4,  'RUBEN',    'SEMEDO',       'DEF', 'Al Qadsiah',      false),
    p(5,  'RUBEN',    'NEVES',        'MID', 'Al Hilal',        false),
    p(8,  'JOAO',     'MOUTINHO',     'MID', 'Monaco',          false),
    p(9,  'ANDRE',    'SILVA',        'FWD', 'RB Leipzig',      false),
    p(14, 'GONCALO',  'RAMOS',        'FWD', 'PSG',             false),
    p(19, 'PEDRO',    'NETO',         'FWD', 'Chelsea',         false),
  ],
}

export const sampleMatch = {
  homeTeam: turkey,
  awayTeam: portugal,
  referee: 'FELIX ZWAYER',
}
