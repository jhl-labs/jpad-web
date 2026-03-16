export interface BuiltInTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  content: string;
  category: string;
  isBuiltIn: true;
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getBuiltInTemplates(): BuiltInTemplate[] {
  const today = todayString();

  return [
    {
      id: "builtin-meeting-notes",
      name: "회의록",
      description: "날짜, 참석자, 안건, 논의 내용, 결정 사항, 액션 아이템",
      icon: "\ud83d\udccb",
      category: "meeting",
      isBuiltIn: true,
      content: `# 회의록

## 기본 정보
- **날짜**: ${today}
- **시간**:
- **장소**:
- **참석자**:

---

## 안건
1.

---

## 논의 내용

### 안건 1
-

---

## 결정 사항
- [ ]

---

## 액션 아이템
| 담당자 | 내용 | 기한 |
|--------|------|------|
|        |      |      |

---

## 다음 회의
- **일시**:
- **안건**:
`,
    },
    {
      id: "builtin-project-plan",
      name: "프로젝트 계획",
      description: "목표, 범위, 일정, 담당자, 마일스톤, 리스크",
      icon: "\ud83d\udcca",
      category: "project",
      isBuiltIn: true,
      content: `# 프로젝트 계획

## 개요
- **프로젝트명**:
- **시작일**: ${today}
- **종료 예정일**:
- **프로젝트 리더**:

---

## 목표
1.

---

## 범위
### 포함
-

### 제외
-

---

## 일정 및 마일스톤
| 마일스톤 | 내용 | 담당자 | 기한 | 상태 |
|----------|------|--------|------|------|
| M1       |      |        |      | \ud83d\udfe1 |
| M2       |      |        |      | \ud83d\udfe1 |

---

## 담당자 및 역할
| 이름 | 역할 | 담당 영역 |
|------|------|-----------|
|      |      |           |

---

## 리스크
| 리스크 | 영향도 | 발생 확률 | 대응 방안 |
|--------|--------|-----------|-----------|
|        |        |           |           |

---

## 참고 자료
-
`,
    },
    {
      id: "builtin-daily-note",
      name: "일일 노트",
      description: "날짜(자동), 오늘의 할 일, 메모, 회고",
      icon: "\ud83d\udcdd",
      category: "journal",
      isBuiltIn: true,
      content: `# 일일 노트 - ${today}

## 오늘의 할 일
- [ ]
- [ ]
- [ ]

---

## 메모


---

## 회고
### 잘한 점
-

### 개선할 점
-

### 내일 할 일
-
`,
    },
    {
      id: "builtin-weekly-review",
      name: "주간 회고",
      description: "이번 주 성과, 배운 점, 다음 주 계획",
      icon: "\ud83d\udcd6",
      category: "journal",
      isBuiltIn: true,
      content: `# 주간 회고

## 기간
- **시작**:
- **종료**:

---

## 이번 주 성과
1.
2.
3.

---

## 배운 점
-

---

## 아쉬운 점
-

---

## 다음 주 계획
### 우선순위 높음
- [ ]

### 우선순위 보통
- [ ]

### 우선순위 낮음
- [ ]

---

## 기타 메모
-
`,
    },
    {
      id: "builtin-bug-report",
      name: "버그 리포트",
      description: "환경, 재현 단계, 예상 동작, 실제 동작, 스크린샷",
      icon: "\ud83d\udc1b",
      category: "custom",
      isBuiltIn: true,
      content: `# 버그 리포트

## 요약
- **제목**:
- **심각도**: \ud83d\udfe1 낮음 / \ud83d\udfe0 보통 / \ud83d\udd34 높음 / \ud83d\udfe3 치명적
- **보고자**:
- **보고일**: ${today}

---

## 환경
- **OS**:
- **브라우저**:
- **버전**:
- **기기**:

---

## 재현 단계
1.
2.
3.

---

## 예상 동작
-

---

## 실제 동작
-

---

## 스크린샷 / 영상


---

## 추가 정보
- **로그**:
- **관련 이슈**:
`,
    },
    {
      id: "builtin-proposal",
      name: "제안서",
      description: "배경, 문제, 제안 내용, 기대 효과, 리소스",
      icon: "\ud83d\udca1",
      category: "custom",
      isBuiltIn: true,
      content: `# 제안서

## 배경
-

---

## 문제 정의
### 현재 상황
-

### 문제점
-

---

## 제안 내용
### 핵심 아이디어
-

### 세부 내용
1.
2.
3.

---

## 기대 효과
-

---

## 필요 리소스
| 항목 | 설명 | 예상 비용/시간 |
|------|------|----------------|
|      |      |                |

---

## 일정 계획
| 단계 | 내용 | 기간 |
|------|------|------|
|      |      |      |

---

## 리스크 및 대안
-
`,
    },
  ];
}
