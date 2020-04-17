type Args<T> = [T] extends [(...args: infer U) => any] ? U : [T] extends [void] ? [] : [T]

export interface Disposable {
    dispose(): boolean
}

export class Emitter<Events extends { [key in string]: any }> {
    protected handlers = new Map<any, Set<(...args: any) => any>>()

    on<T extends keyof Events>(event: T, handler: Events[T]): Disposable {
        let handlers = this.handlers.get(event)

        if (handlers) handlers.add(handler)
        else this.handlers.set(event, new Set([handler]))

        return {
            dispose: () => this.removeListener(event, handler)
        }
    }

    once<T extends keyof Events>(event: T, handler: Events[T]): Disposable {
        const listener = this.on(event, <any>((...args: any[]) => {
            handler(...args)
            listener.dispose()
        }))
        return listener
    }

    off<T extends keyof Events>(event: T, handler: Events[T]) {
        const handlers = this.handlers.get(event)
        if (!handlers) return false
        return handlers.delete(handler)
    }

    removeListener = this.off

    emit<T extends keyof Events>(event: T, ...args: Args<Events[T]>) {
        const handlers = this.handlers.get(event)
        if (!handlers || handlers.size == 0) return false;
        [...handlers].forEach(cb => cb(...args))
        return true
    }
}
