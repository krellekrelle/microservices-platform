// Simplified Garmin Connect Workout Types - Only for addWorkout() creation

export interface ISportType {
    sportTypeId: number;
    sportTypeKey: string;
    displayOrder?: number;
}

export interface IWorkoutDetail {
    workoutName: string;
    description?: string;
    updateDate: Date;
    createdDate: Date;
    sportType: ISportType;
    estimatedDurationInSecs: number;
    estimatedDistanceInMeters: number | null;
    workoutSegments: IWorkoutSegment[];
}

export interface IWorkoutSegment {
    segmentOrder: number;
    sportType: ISportType;
    workoutSteps: IWorkoutStep[];
}

export interface IWorkoutStep {
    type: string;
    stepOrder: number;
    stepType: IStepType;
    endCondition: IEndCondition;
    endConditionValue: number | null;
    targetType: ITargetType;
    targetValueOne?: number | null;
    targetValueTwo?: number | null;
    strokeType: IStrokeType;
    equipmentType: IEquipmentType;
}

export interface IStepType {
    stepTypeId: number;
    stepTypeKey: string;
    displayOrder: number;
}

export interface IEndCondition {
    conditionTypeId: number;
    conditionTypeKey: string;
    displayOrder: number;
    displayable: boolean;
}

export interface ITargetType {
    workoutTargetTypeId: number;
    workoutTargetTypeKey: string;
    displayOrder: number;
}

export interface IStrokeType {
    strokeTypeId: number;
    strokeTypeKey?: string | null;
    displayOrder: number;
}

export interface IEquipmentType {
    equipmentTypeId: number;
    equipmentTypeKey?: string | null;
    displayOrder: number;
}

// Common values for workout creation:
// sportType: {sportTypeId: 1, sportTypeKey: "running"}
// stepType: {stepTypeId: 1, stepTypeKey: "interval"}
// endCondition time: {conditionTypeId: 2, conditionTypeKey: "time"}
// endCondition distance: {conditionTypeId: 3, conditionTypeKey: "distance"}
// targetType no target: {workoutTargetTypeId: 1, workoutTargetTypeKey: "no.target"}
// strokeType: {strokeTypeId: 0}
// equipmentType: {equipmentTypeId: 0}