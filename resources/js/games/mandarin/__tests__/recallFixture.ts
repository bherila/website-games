import courseJson from '../../../../data/mandarin/foundations.v1.json'
import recalls from '../../../../data/mandarin/recall-exercises.v2.json'
import { buildCourseIndex } from '../domain/course'
import { parseCourse } from '../domain/courseSchema'

export function recallCourse() {
  return buildCourseIndex(parseCourse({ ...courseJson, schemaVersion: 2, contentVersion: '1.2.0', recallExercises: recalls }))
}
