/**
 * A presenter takes a finished result and shapes it for one surface
 * (docs/architecture_phase1.md §9).
 *
 * `present` is synchronous on purpose: a presenter that can `await` is a
 * presenter that can fetch, and the moment it fetches it has stopped being a
 * presenter. Phase 2's dashboard is a second implementation of this interface,
 * not a second use case.
 */
export interface Presenter<In, Out> {
  present(input: In): Out;
}
