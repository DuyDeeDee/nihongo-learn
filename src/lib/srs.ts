import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
export type SrsState={card:Card;nextDue:Date;scheduledDays:number;rating:Rating};
const scheduler=fsrs({request_retention:0.9,enable_fuzz:false});
export function scheduleReview(card:Card|undefined,rating:Rating,now=new Date()):SrsState{const current:Card=card??createEmptyCard<Card>(now);const result=scheduler.next(current,now,Number(rating) as Grade);return{card:result.card,nextDue:result.card.due,scheduledDays:result.log.scheduled_days,rating};}
export {createEmptyCard,Rating};
export type {Card};
