const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

/**
 * Parses page/pageSize query params.
 * pageSize = -1 means "return all rows" (used for dropdown-style lists).
 */
function getPagination(query = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  let pageSize = parseInt(query.pageSize, 10);

  if (pageSize === -1) {
    return { page: 1, pageSize: -1, limit: null, offset: 0, all: true };
  }

  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    pageSize = DEFAULT_PAGE_SIZE;
  }
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  const offset = (page - 1) * pageSize;
  return { page, pageSize, limit: pageSize, offset, all: false };
}

function buildPageMeta({ page, pageSize, all }, totalCount) {
  if (all) {
    return { page: 1, pageSize: totalCount, totalCount, totalPages: 1 };
  }
  return {
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(Math.ceil(totalCount / pageSize), 1)
  };
}

module.exports = { getPagination, buildPageMeta };
