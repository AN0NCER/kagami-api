class ApiError extends Error {
  /**
   * @param {number} status HTTP-статус
   * @param {string} type   Тип ошибки в стиле Jikan (BadResponseException и т.п.)
   * @param {string} message
   */
  constructor(status, type, message) {
    super(message);
    this.status = status;
    this.type = type;
  }

  toJSON() {
    return {
      status: this.status,
      type: this.type,
      message: this.message,
      error: null,
    };
  }
}

module.exports = { ApiError };
