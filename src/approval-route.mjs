/** Null routes are legacy requests; new requests carry an immutable configured route. */
export function isCurrentApprover(request,profileId){return !Array.isArray(request?.approver_ids)||request.approver_ids[(request.current_step||1)-1]===profileId;}
