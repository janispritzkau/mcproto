type Handler<T> = (value: T) => void

export class Emitter<Events = {[key in string | number]: any}> {
    protected handlers = new Map<any, Set<Handler<any>>>()

    on<T extends keyof Events>(event: T, handler: Handler<Events[T]>) {
        let handlers = this.handlers.get(event)
        if (handlers) handlers.add(handler)
        else (handlers = new Set([handler]), this.handlers.set(event, handlers))
        return () => this.removeListener(event, handler)
    }

    once<T extends keyof Events>(event: T, handler: Handler<Events[T]>) {
        const removeListener = this.on(event, value => {
            handler(value)
            removeListener()
        })
    }

    removeListener<T extends keyof Events>(event: T, handler: Handler<Events[T]>) {
        const handlers = this.handlers.get(event)
        if (!handlers) return false
        return handlers.delete(handler)
    }

    emit<T extends keyof Events>(event: T, value: Events[T]) {
        const handlers = this.handlers.get(event)
        if (!handlers) return false;
        [...handlers].forEach(cb => cb(value))
        return true
    }
}
