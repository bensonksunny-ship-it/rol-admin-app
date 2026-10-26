// Baptism MCQ exam (Baptism Application, Stage 3) — taken by the candidate on
// /baptism-exam?token=… once their Cell Leader has signed off (Stage 2).
//
// DRAFT QUESTIONS: edit the wording, options or answers here — the exam page, the
// staff tracker and the scoring all read from this one file. `answer` is the index
// of the correct option. Changing a question's answer re-scores earlier attempts
// on the staff side (scores are always recomputed from the stored answers).

export const BAPTISM_EXAM_PASS_PERCENT = 70

export const BAPTISM_EXAM_QUESTIONS = [
  {
    id: 'q1',
    text: 'What does water baptism publicly declare?',
    options: [
      'That I have joined a church committee',
      'My faith in Jesus Christ, and that I belong to Him',
      'That I will never face difficulties again',
      'That my family has decided for me',
    ],
    answer: 1,
  },
  {
    id: 'q2',
    text: 'Who should be baptised?',
    options: [
      'Anyone who attends church on Sunday',
      'Only people who have read the whole Bible',
      'A person who has repented and believed in Jesus as Lord and Saviour',
      'Only children of church members',
    ],
    answer: 2,
  },
  {
    id: 'q3',
    text: 'In whose name did Jesus command His disciples to baptise (Matthew 28:19)?',
    options: [
      'In the name of the church',
      'In the name of the Father, and of the Son, and of the Holy Spirit',
      'In the name of the pastor',
      'In the name of the apostles',
    ],
    answer: 1,
  },
  {
    id: 'q4',
    text: 'What does going down into the water and coming up out of it picture (Romans 6:4)?',
    options: [
      'Being washed of physical dirt',
      'Dying to the old life and rising to a new life with Christ',
      'Joining a new family name',
      'A ritual that has no meaning',
    ],
    answer: 1,
  },
  {
    id: 'q5',
    text: 'How are we saved?',
    options: [
      'By being baptised alone',
      'By doing more good works than bad',
      'By grace, through faith in Jesus Christ',
      'By attending church regularly',
    ],
    answer: 2,
  },
  {
    id: 'q6',
    text: 'According to Acts 2:38, what comes before baptism?',
    options: ['Repentance', 'Marriage', 'Becoming a church member', 'Paying tithe'],
    answer: 0,
  },
  {
    id: 'q7',
    text: 'How is baptism done at River of Life Christian Church?',
    options: [
      'Sprinkling water on the head',
      'By immersion — the whole body goes under the water',
      'Pouring oil on the forehead',
      'Signing a certificate only',
    ],
    answer: 1,
  },
  {
    id: 'q8',
    text: 'Whose decision should it be to take baptism?',
    options: [
      'My parents\' or spouse\'s decision',
      'The cell leader\'s decision',
      'My own free decision, without any compulsion',
      'Whoever brought me to church',
    ],
    answer: 2,
  },
  {
    id: 'q9',
    text: 'After baptism, how does a believer keep growing?',
    options: [
      'Nothing more is needed after baptism',
      'Through prayer, reading God\'s Word and fellowship with other believers',
      'By being baptised again every year',
      'Only by attending special events',
    ],
    answer: 1,
  },
  {
    id: 'q10',
    text: 'Who is the head of the Church?',
    options: ['The Senior Pastor', 'The church board', 'Jesus Christ', 'The oldest member'],
    answer: 2,
  },
]

const PASS_COUNT = Math.ceil((BAPTISM_EXAM_PASS_PERCENT / 100) * BAPTISM_EXAM_QUESTIONS.length)

/** Score one attempt's answers ({ [questionId]: optionIndex }) against the key. */
export function scoreBaptismExam(answers = {}) {
  const total = BAPTISM_EXAM_QUESTIONS.length
  const score = BAPTISM_EXAM_QUESTIONS.filter((q) => Number(answers?.[q.id]) === q.answer).length
  return { score, total, passed: score >= PASS_COUNT, passCount: PASS_COUNT }
}
