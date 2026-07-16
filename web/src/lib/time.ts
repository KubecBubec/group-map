import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/sk";

dayjs.extend(relativeTime);
dayjs.locale("sk");

export const fromNow = (value: string | Date) => dayjs(value).fromNow();
export const clock = (value: string | Date) => dayjs(value).format("HH:mm");
