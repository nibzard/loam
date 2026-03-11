type PlaybackErrorLike = {
  response?: {
    code?: number;
    status?: number;
  };
  networkDetails?: {
    status?: number;
  };
};

function getPlaybackErrorStatus(error: PlaybackErrorLike): number | null {
  if (typeof error.response?.code === "number") {
    return error.response.code;
  }

  if (typeof error.response?.status === "number") {
    return error.response.status;
  }

  if (typeof error.networkDetails?.status === "number") {
    return error.networkDetails.status;
  }

  return null;
}

export function isPlaybackAccessError(error: PlaybackErrorLike): boolean {
  const status = getPlaybackErrorStatus(error);
  return status === 401 || status === 403;
}
