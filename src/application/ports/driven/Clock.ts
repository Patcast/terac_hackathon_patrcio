/**
 * The only source of "now" anywhere inside a use case.
 *
 * Everything month-shaped hangs off it — which month is settled, whether a book
 * may still move, when a cache entry expires — so a test that cannot pin the
 * date cannot test any of it.
 */
export interface Clock {
  now(): Date;
}
