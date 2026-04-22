import getCurrentUser from "./get-current-user";
import recommendDepartment from "./recommend-department";
import listDoctors from "./list-doctors";
import checkAvailability from "./check-availability";
import bookAppointment from "./book-appointment";
import rescheduleAppointment from "./reschedule-appointment";
import cancelAppointment from "./cancel-appointment";
import getUserAppointments from "./get-user-appointments";
import getPreparationGuide from "./get-preparation-guide";
import searchHospitalFaq from "./search-hospital-faq";
import scheduleFollowup from "./schedule-followup";
import findNearestBranch from "./find-nearest-branch";
import saveFeedbackNote from "./save-feedback-note";

const MAX_RESULT_CHARS = 3000;

function truncateResult(result: unknown): unknown {
  const json = JSON.stringify(result);
  if (json.length <= MAX_RESULT_CHARS) return result;

  if (Array.isArray(result)) {
    let count = result.length;
    while (count > 1 && JSON.stringify(result.slice(0, count)).length > MAX_RESULT_CHARS) {
      count = Math.floor(count * 0.75);
    }
    return { items: result.slice(0, count), _truncated: true, showing: count, total: result.length };
  }

  return { _truncated: true, data: json.slice(0, MAX_RESULT_CHARS) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withCap(t: any): any {
  const orig = t.execute;
  return { ...t, execute: async (...args: unknown[]) => truncateResult(await orig(...args)) };
}

export const tools = {
  get_current_user: withCap(getCurrentUser),
  recommend_department: withCap(recommendDepartment),
  list_doctors: withCap(listDoctors),
  check_availability: withCap(checkAvailability),
  book_appointment: withCap(bookAppointment),
  reschedule_appointment: withCap(rescheduleAppointment),
  cancel_appointment: withCap(cancelAppointment),
  get_user_appointments: withCap(getUserAppointments),
  get_preparation_guide: withCap(getPreparationGuide),
  search_hospital_faq: withCap(searchHospitalFaq),
  schedule_followup: withCap(scheduleFollowup),
  find_nearest_branch: withCap(findNearestBranch),
  save_feedback_note: withCap(saveFeedbackNote),
};

export type ToolName = keyof typeof tools;
