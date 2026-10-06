export const DELIVERY_CALENDAR_OPEN_EVENT = "mh:open-delivery-calendar";

export const openDeliveryCalendar = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(DELIVERY_CALENDAR_OPEN_EVENT));
  }
};
