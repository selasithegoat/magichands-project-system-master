export const buildPaginationRange = (currentPage, totalPages, delta = 1) => {
  const current = Number(currentPage) || 1;
  const total = Number(totalPages) || 0;

  if (total <= 1) {
    return total === 1 ? [1] : [];
  }

  const range = [];
  for (let page = 1; page <= total; page += 1) {
    if (
      page === 1 ||
      page === total ||
      (page >= current - delta && page <= current + delta)
    ) {
      range.push(page);
    }
  }

  const pages = [];
  let lastPage;
  range.forEach((page) => {
    if (lastPage) {
      if (page - lastPage === 2) {
        pages.push(lastPage + 1);
      } else if (page - lastPage > 2) {
        pages.push("ellipsis");
      }
    }
    pages.push(page);
    lastPage = page;
  });

  return pages;
};
