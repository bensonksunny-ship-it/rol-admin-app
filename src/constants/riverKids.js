// River Kids Class/Group options — shared by the register form's multi-select and
// the Attendance tab's group tabs, so a kid's classGroups array and the attendance
// sub-page keys always speak the same vocabulary.
export const RK_CLASS_GROUPS = [
  { key: 'sunday-school', label: 'Sunday School' },
  { key: 'river-kids-1',  label: 'River Kids-1'  },
  { key: 'river-kids-2',  label: 'River Kids-2'  },
]
export const rkClassGroupLabel = (key) => RK_CLASS_GROUPS.find(g => g.key === key)?.label || key
