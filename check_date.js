
function getNewYorkDateParts() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const second = Number(values.second);
  const utcDate = Date.UTC(year, month - 1, day, hour, minute, second);
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dayOfWeek: new Date(utcDate).getUTCDay(),
  };
}

const result = getNewYorkDateParts();
console.log(JSON.stringify(result, null, 2));

const mins = result.hour * 60 + result.minute;
let session = "CLOSED";
if (result.dayOfWeek !== 0 && result.dayOfWeek !== 6) {
    if (mins >= 570 && mins < 960) session = "OPEN";
    else if ((mins >= 240 && mins < 570) || (mins >= 960 && mins < 1200)) session = "EXTENDED";
}
console.log("Current Session Logic says:", session);
console.log("Mins:", mins);
