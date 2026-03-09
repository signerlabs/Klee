declare global {
  interface AggregateError extends Error {
    errors: any[]
  }

  var AggregateError: {
    new (errors?: Iterable<any>, message?: string): AggregateError
    (errors?: Iterable<any>, message?: string): AggregateError
    readonly prototype: AggregateError
  }
}

export {}
