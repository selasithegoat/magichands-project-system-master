let activeLockCount = 0;
let savedStyles = null;

const restoreDocumentScroll = () => {
  if (!savedStyles || typeof document === "undefined") return;

  const { body, documentElement } = document;
  body.style.overflow = savedStyles.bodyOverflow;
  body.style.overscrollBehavior = savedStyles.bodyOverscrollBehavior;
  body.style.paddingRight = savedStyles.bodyPaddingRight;
  documentElement.style.overflow = savedStyles.rootOverflow;
  savedStyles = null;
};

/**
 * Locks document scrolling until every active caller has released its lock.
 * The returned release function is idempotent so React effect cleanup remains
 * safe in Strict Mode and when a component closes during navigation.
 */
export const lockDocumentScroll = () => {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !document.body ||
    !document.documentElement
  ) {
    return () => {};
  }

  const { body, documentElement } = document;

  if (activeLockCount === 0) {
    savedStyles = {
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
      bodyPaddingRight: body.style.paddingRight,
      rootOverflow: documentElement.style.overflow,
    };

    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    documentElement.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  activeLockCount += 1;
  let isReleased = false;

  return () => {
    if (isReleased) return;
    isReleased = true;
    activeLockCount = Math.max(0, activeLockCount - 1);

    if (activeLockCount === 0) {
      restoreDocumentScroll();
    }
  };
};

