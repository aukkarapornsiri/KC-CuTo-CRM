// Role permission is necessary, and only the current configured reviewer can act.
export function canReviewSO(request,profileId,canApprove){return !!(canApprove&&profileId&&request?.status==='pending'&&request.requested_by!==profileId&&request.approver_ids?.[Number(request.current_step)-1]===profileId);}
